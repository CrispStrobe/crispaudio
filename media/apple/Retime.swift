// MIT — Explicit nearest-frame speed/reverse derivation; no optical flow.
import Foundation
import AVFoundation
import CoreImage
struct RetimeSettings:Decodable {var offset:Double;var duration:Double;var rate:Double;var reverse:Bool;var frameRate:Double}
func retimeVideo(_ asset:AVAsset,_ output:String,_ settings:RetimeSettings) async throws {
 guard let track=try await asset.loadTracks(withMediaType:.video).first else{try fail("No picture to retime")}
 let natural=try await track.load(.naturalSize),transform=try await track.load(.preferredTransform),bounds=CGRect(origin:.zero,size:natural).applying(transform)
 let width=Int(abs(bounds.width)/2)*2,height=Int(abs(bounds.height)/2)*2
 guard width>0,height>0,width*height<=16384000 else{try fail("Retimed picture exceeds the 16 MP frame budget")}
 let writer=try AVAssetWriter(outputURL:URL(fileURLWithPath:output),fileType:.mp4)
 let input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:width,AVVideoHeightKey:height])
 let attributes:[String:Any]=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA,kCVPixelBufferWidthKey as String:width,kCVPixelBufferHeightKey as String:height,kCVPixelBufferIOSurfacePropertiesKey as String:[:]]
 let adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:attributes);writer.add(input)
 guard writer.startWriting() else{try fail(writer.error?.localizedDescription ?? "Cannot start retimed picture")};writer.startSession(atSourceTime:.zero)
 let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true
 // Half a source frame permits the nearest decodable sample, without interpolation.
 let sourceFps=Double(try await track.load(.nominalFrameRate));let tolerance=CMTime(seconds:0.5/max(1,sourceFps),preferredTimescale:60000)
 generator.requestedTimeToleranceBefore=tolerance;generator.requestedTimeToleranceAfter=tolerance
 let context=CIContext(options:[.cacheIntermediates:false,.workingColorSpace:NSNull(),.outputColorSpace:NSNull()]),duration=settings.duration/settings.rate,count=Int(ceil(duration*settings.frameRate-1e-9))
 for frame in 0..<count {
  while !input.isReadyForMoreMediaData {if writer.status == .failed{throw writer.error!};try await Task.sleep(nanoseconds:1000000)}
  try autoreleasepool {
   let local=min(settings.duration-1/max(1,sourceFps),Double(frame)/settings.frameRate*settings.rate)
   let at=settings.offset+(settings.reverse ? max(0,settings.duration-1/max(1,sourceFps)-local):max(0,local))
   let cg=try generator.copyCGImage(at:CMTime(seconds:at,preferredTimescale:60000),actualTime:nil)
   var buffer:CVPixelBuffer?;guard let pool=adaptor.pixelBufferPool,CVPixelBufferPoolCreatePixelBuffer(nil,pool,&buffer)==kCVReturnSuccess,let pixels=buffer else{try fail("Retimed frame allocation failed")}
   let image=CIImage(cgImage:cg).transformed(by:CGAffineTransform(scaleX:Double(width)/Double(cg.width),y:Double(height)/Double(cg.height)))
   context.render(image,to:pixels,bounds:CGRect(x:0,y:0,width:width,height:height),colorSpace:nil)
   guard adaptor.append(pixels,withPresentationTime:CMTime(seconds:Double(frame)/settings.frameRate,preferredTimescale:60000)) else{try fail(writer.error?.localizedDescription ?? "Cannot append retimed frame")}
  }
 }
 input.markAsFinished();writer.endSession(atSourceTime:CMTime(seconds:duration,preferredTimescale:60000));await writer.finishWriting()
 guard writer.status == .completed else{try fail(writer.error?.localizedDescription ?? "Retimed picture failed")}
}
