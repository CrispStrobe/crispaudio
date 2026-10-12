// MIT — native still images, titles and independent delivery captions.
import Foundation
import CoreGraphics
import CoreImage
import CoreText
struct TitleStyle:Decodable {var font:String;var size:Double;var align:String;var color:String;var background:String;var backgroundOpacity:Double;var boxWidth:Double;var lineHeight:Double}
struct Graphic:Decodable {
    var id:String;var type:String;var name:String;var startTime:Double;var duration:Double;var text:String?;var path:String?;var style:TitleStyle?;var composition:Picture.Placement
    func picture()->Picture {Picture(id:id,sourceId:nil,startTime:startTime,sourceOffset:0,duration:duration,fadeIn:nil,fadeOut:nil,transition:"cut",transitionDuration:nil,colorCorrection:nil,transform:nil,composition:composition,videoTrackId:nil)}
}
struct GraphicTrack:Decodable {var id:String;var name:String;var visible:Bool;var locked:Bool;var rippleEnabled:Bool;var clips:[Graphic]}
struct CaptionCue:Decodable {var id:String;var start:Double;var end:Double;var text:String}
struct CaptionTrack:Decodable {var id:String;var name:String;var visible:Bool;var locked:Bool;var rippleEnabled:Bool;var burnIn:Bool;var style:TitleStyle;var cues:[CaptionCue]}
struct RenderGraphic {var clip:Graphic}
func graphicColor(_ value:String,_ alpha:Double=1)->CGColor {
    let hex=UInt32(value.dropFirst(),radix:16) ?? 0xffffff
    return CGColor(colorSpace:CGColorSpaceCreateDeviceRGB(),components:[CGFloat((hex>>16)&255)/255,CGFloat((hex>>8)&255)/255,CGFloat(hex&255)/255,alpha])!
}
func titleImage(_ text:String,_ style:TitleStyle,_ size:CGSize)throws->CIImage {
    let w=Int(size.width),h=Int(size.height)
    guard let ctx=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue) else {try fail("Cannot allocate title image")}
    let font=CTFontCreateWithName(style.font as CFString,style.size*size.height,nil)
    let attributes:[NSAttributedString.Key:Any]=[NSAttributedString.Key(kCTFontAttributeName as String):font,NSAttributedString.Key(kCTForegroundColorAttributeName as String):graphicColor(style.color)]
    let line: (String)->CTLine={CTLineCreateWithAttributedString(NSAttributedString(string:$0,attributes:attributes))}
    let measure:(String)->Double={CTLineGetTypographicBounds(line($0),nil,nil,nil)}
    let box=style.boxWidth*size.width,pad=style.size*size.height*0.3,maxWidth=box-2*pad
    var lines:[String]=[]
    for paragraph in text.components(separatedBy:"\n") {var current=""
      for word in paragraph.split(whereSeparator:{$0.isWhitespace}).map(String.init) {
        if !current.isEmpty && measure(current+" "+word)>maxWidth {lines.append(current);current=""}
        if measure(word)>maxWidth {for ch in word {if !current.isEmpty && measure(current+String(ch))>maxWidth {lines.append(current);current=""};current+=String(ch)}} else {current+=(current.isEmpty ? "":" ")+word}
      };lines.append(current)
    }
    let lineHeight=style.size*size.height*style.lineHeight,block=Double(lines.count)*lineHeight+2*pad
    ctx.setFillColor(graphicColor(style.background,style.backgroundOpacity));ctx.fill(CGRect(x:(size.width-box)/2,y:(size.height-block)/2,width:box,height:block))
    for (i,text) in lines.enumerated(){let value=line(text),width=measure(text),x=style.align=="left" ? (size.width-box)/2+pad : style.align=="right" ? (size.width+box)/2-pad-width : (size.width-width)/2
      let baseline=size.height/2-(Double(i)-(Double(lines.count)-1)/2)*lineHeight-(CTFontGetAscent(font)-CTFontGetDescent(font))/2
      ctx.textPosition=CGPoint(x:x,y:baseline);CTLineDraw(value,ctx)
    }
    guard let image=ctx.makeImage() else {try fail("Cannot create title image")};return CIImage(cgImage:image,options:[.colorSpace:NSNull()])
}
func renderGraphics(_ tracks:[GraphicTrack],_ captions:CaptionTrack?,_ size:CGSize)throws->[RenderGraphic]{
    var result:[RenderGraphic]=[]
    for track in tracks.reversed() where track.visible {for clip in track.clips {
      result.append(RenderGraphic(clip:clip))
    }}
    if let track=captions,track.visible && track.burnIn {for cue in track.cues {
      let placement=Picture.Placement(x:0,y:0.38,scale:1,rotation:0,opacity:1,crop:Picture.Crop(left:0,top:0,right:0,bottom:0),keyframes:nil,keyframeOffset:nil)
      let clip=Graphic(id:cue.id,type:"title",name:"",startTime:cue.start,duration:cue.end-cue.start,text:cue.text,path:nil,style:track.style,composition:placement)
      result.append(RenderGraphic(clip:clip))
    }}
    return result
}
func graphicFrame(_ item:RenderGraphic,_ time:Double,_ size:CGSize,_ cache:inout [String:CIImage])throws->CIImage {
    let clip=item.clip,pose=clip.picture().pose(time-clip.startTime),crop=clip.composition.crop
    var image:CIImage
    if let cached=cache[clip.id]{image=cached}else{
      if clip.type=="image" {guard let path=clip.path,let decoded=CIImage(contentsOf:URL(fileURLWithPath:path),options:[.applyOrientationProperty:true,.colorSpace:NSNull()]) else {try fail("Cannot decode graphic image")};image=decoded}
      else {guard let text=clip.text,let style=clip.style else {try fail("Missing title settings")};image=try titleImage(text,style,size)}
      let pixels=image.extent.width*image.extent.height
      if pixels>64*1024*1024 {try fail("Graphic exceeds the 64 megapixel raster budget")}
      if cache.values.reduce(0,{$0+$1.extent.width*$1.extent.height})+pixels>32*1024*1024{cache.removeAll()}
      cache[clip.id]=image
    }
    let bounds=image.extent,sw=bounds.width,sh=bounds.height,fit=min(size.width/sw,size.height/sh)
    image=image.cropped(to:CGRect(x:bounds.minX+crop.left*sw,y:bounds.minY+crop.bottom*sh,width:sw*(1-crop.left-crop.right),height:sh*(1-crop.top-crop.bottom)))
    image=image.transformed(by:CGAffineTransform(translationX:-bounds.minX-sw/2,y:-bounds.minY-sh/2)).transformed(by:CGAffineTransform(scaleX:fit*pose.scale,y:fit*pose.scale)).transformed(by:CGAffineTransform(rotationAngle:-pose.rotation*Double.pi/180)).transformed(by:CGAffineTransform(translationX:size.width*(0.5+pose.x),y:size.height*(0.5-pose.y)))
    return image.applyingFilter("CIColorMatrix",parameters:["inputAVector":CIVector(x:0,y:0,z:0,w:pose.opacity)])
}
