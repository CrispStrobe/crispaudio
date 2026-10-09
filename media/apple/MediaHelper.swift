// MIT — CrispAudio native desktop media helper. Uses only Apple system frameworks.
import Foundation
import AVFoundation
import AudioToolbox
import CoreImage
import ImageIO
import UniformTypeIdentifiers

struct Picture: Decodable {
    var id:String; var sourceId:String?; var startTime:Double; var sourceOffset:Double; var duration:Double
    var fadeIn:Double?; var fadeOut:Double?; var transition:String; var transitionDuration:Double?
    struct Color:Decodable {var enabled:Bool;var exposure:Double;var contrast:Double;var saturation:Double}
    struct Orientation:Decodable {var rotation:Int;var flipHorizontal:Bool;var flipVertical:Bool}
    var colorCorrection:Color?;var transform:Orientation?
}
struct Source:Decodable {var id:String;var path:String}
struct Edit:Decodable {var path:String;var sources:[Source]?;var clips:[Picture];var frameRate:Double?;var duration:Double?}
struct RenderPicture {var clip:Picture;var track: CMPersistentTrackID;var preferred:CGAffineTransform}
final class Instruction:NSObject,AVVideoCompositionInstructionProtocol {
    var timeRange:CMTimeRange;var enablePostProcessing=false;var containsTweening=true
    var requiredSourceTrackIDs:[NSValue]?;var passthroughTrackID:CMPersistentTrackID=kCMPersistentTrackID_Invalid
    let pictures:[RenderPicture]
    init(duration:Double,pictures:[RenderPicture]) {self.pictures=pictures;timeRange=CMTimeRange(start:.zero,duration:CMTime(seconds:duration,preferredTimescale:60000));requiredSourceTrackIDs=pictures.map{NSNumber(value:$0.track)}}
}
final class Compositor:NSObject,AVVideoCompositing {
    var sourcePixelBufferAttributes:[String:Any]?=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA]
    var requiredPixelBufferAttributesForRenderContext:[String:Any]=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32BGRA]
    private let context=CIContext(options:[.cacheIntermediates:false,.workingColorSpace:NSNull(), .outputColorSpace:NSNull()])
    private let queue=DispatchQueue(label:"crispaudio.apple.compositor")
    func renderContextChanged(_ newRenderContext:AVVideoCompositionRenderContext) {}
    func startRequest(_ request:AVAsynchronousVideoCompositionRequest) {queue.async {autoreleasepool {
        guard let instruction=request.videoCompositionInstruction as? Instruction,let output=request.renderContext.newPixelBuffer() else {request.finish(with:NSError(domain:"CrispAudio",code:1));return}
        let size=request.renderContext.size,rect=CGRect(origin:.zero,size:size),time=request.compositionTime.seconds
        let black=CIImage(color:.black).cropped(to:rect)
        var result=black
        var hasOutgoing=false
        for item in instruction.pictures.sorted(by:{$0.clip.startTime<$1.clip.startTime}) {
            let clip=item.clip,local=time-clip.startTime
            if local<0 || local>=clip.duration {continue}
            guard let buffer=request.sourceFrame(byTrackID:item.track) else {continue}
            var image=CIImage(cvPixelBuffer:buffer,options:[.colorSpace:NSNull()]).transformed(by:item.preferred)
            image=image.transformed(by:CGAffineTransform(translationX:-image.extent.minX,y:-image.extent.minY))
            if let c=clip.colorCorrection,c.enabled {
                func matrix(_ image:CIImage,_ scale:Double,_ bias:Double)->CIImage {
                    image.applyingFilter("CIColorMatrix",parameters:["inputRVector":CIVector(x:scale,y:0,z:0,w:0),"inputGVector":CIVector(x:0,y:scale,z:0,w:0),"inputBVector":CIVector(x:0,y:0,z:scale,w:0),"inputBiasVector":CIVector(x:bias,y:bias,z:bias,w:0)]).applyingFilter("CIColorClamp")
                }
                image=matrix(image,pow(2,c.exposure),0);image=matrix(image,c.contrast,(1-c.contrast)*0.5)
                let s=c.saturation,r=0.213*(1-s),g=0.715*(1-s),b=0.072*(1-s)
                image=image.applyingFilter("CIColorMatrix",parameters:["inputRVector":CIVector(x:r+s,y:g,z:b,w:0),"inputGVector":CIVector(x:r,y:g+s,z:b,w:0),"inputBVector":CIVector(x:r,y:g,z:b+s,w:0)]).applyingFilter("CIColorClamp")
            }
            if let t=clip.transform {
                image=image.transformed(by:CGAffineTransform(rotationAngle:-Double(t.rotation)*Double.pi/180))
                image=image.transformed(by:CGAffineTransform(scaleX:t.flipHorizontal ? -1:1,y:t.flipVertical ? -1:1))
                image=image.transformed(by:CGAffineTransform(translationX:-image.extent.minX,y:-image.extent.minY))
            }
            let scale=min(size.width/image.extent.width,size.height/image.extent.height)
            image=image.transformed(by:CGAffineTransform(scaleX:scale,y:scale))
            image=image.transformed(by:CGAffineTransform(translationX:(size.width-image.extent.width)/2,y:(size.height-image.extent.height)/2))
            // Fade the full fitted picture against black, then dissolve between clips.
            let fadeIn=clip.fadeIn ?? 0,fadeOut=clip.fadeOut ?? 0
            let opacity=min(1,fadeIn>0 ? local/fadeIn:1)*min(1,fadeOut>0 ? (clip.duration-local)/fadeOut:1)
            image=image.applyingFilter("CIColorMatrix",parameters:["inputAVector":CIVector(x:0,y:0,z:0,w:opacity)]).composited(over:black)
            let transition=clip.transitionDuration ?? 0
            if hasOutgoing && transition>0 && local<transition {
                do {result=try PictureTransitions.render(result,image,kind:clip.transition,progress:local/transition,rect:rect).cropped(to:rect)}
                catch {request.finish(with:error);return}
            } else {result=image.cropped(to:rect)}
            hasOutgoing=true
        }
        self.context.render(result,to:output,bounds:rect,colorSpace:nil)
        request.finish(withComposedVideoFrame:output)
    }}}
    func cancelAllPendingVideoCompositionRequests(){queue.sync {}}
}
func fail(_ message:String)throws->Never {throw NSError(domain:"CrispAudio",code:1,userInfo:[NSLocalizedDescriptionKey:message])}
func export(_ session:AVAssetExportSession,to output:String,type:AVFileType) async throws {
    session.outputURL=URL(fileURLWithPath:output);session.outputFileType=type;session.shouldOptimizeForNetworkUse=true
    await withCheckedContinuation {(continuation:CheckedContinuation<Void,Never>) in session.exportAsynchronously{continuation.resume()}}
    guard session.status == .completed else {try fail(session.error?.localizedDescription ?? "Apple export failed")}
}
// Sequential, bounded-buffer FLAC encoding. Scope exit finalises STREAMINFO.
func encodeFlac(_ path:String,_ destination:String) throws {
    let input=try AVAudioFile(forReading:URL(fileURLWithPath:path),commonFormat:.pcmFormatFloat32,interleaved:false)
    guard input.processingFormat.sampleRate==48000,input.processingFormat.channelCount==2,input.length>0 else {try fail("FLAC input must be stereo 48 kHz PCM")}
    let settings:[String:Any]=[AVFormatIDKey:kAudioFormatFLAC,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVEncoderBitDepthHintKey:24]
    let output=try AVAudioFile(forWriting:URL(fileURLWithPath:destination),settings:settings,commonFormat:.pcmFormatFloat32,interleaved:false)
    guard let buffer=AVAudioPCMBuffer(pcmFormat:input.processingFormat,frameCapacity:4096) else {try fail("FLAC buffer allocation failed")}
    while input.framePosition<input.length {
        try input.read(into:buffer,frameCount:AVAudioFrameCount(min(4096,input.length-input.framePosition)))
        guard buffer.frameLength>0,let channels=buffer.floatChannelData else {try fail("Incomplete FLAC input")}
        for ch in 0..<2 {for i in 0..<Int(buffer.frameLength) {
            let value=Double(channels[ch][i])
            guard value.isFinite else {try fail("Non-finite FLAC sample")}
            // Match the existing GUI's 24-bit FLAC quantisation, including ties.
            let quantised=max(-8388608,min(8388607,floor(value*8388608+0.5)))
            channels[ch][i]=Float(quantised/8388608)
        }}
        try output.write(from:buffer)
    }
}
// AAC-LC in ADTS, preserving the GUI's .aac container and bitrate control.
func encodeAac(_ path:String,_ destination:String,_ bitrate:Int) throws {
    guard [96,128,192,256,320].contains(bitrate) else {try fail("AAC bitrate must be 96, 128, 192, 256 or 320 kbps")}
    let input=try AVAudioFile(forReading:URL(fileURLWithPath:path),commonFormat:.pcmFormatFloat32,interleaved:false)
    guard input.processingFormat.sampleRate==48000,input.processingFormat.channelCount==2,input.length>0 else {try fail("AAC input must be stereo 48 kHz PCM")}
    let settings:[String:Any]=[AVFormatIDKey:kAudioFormatMPEG4AAC,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVEncoderBitRateKey:bitrate*1000,AVEncoderBitRateStrategyKey:AVAudioBitRateStrategy_Constant]
    let output=try AVAudioFile(forWriting:URL(fileURLWithPath:destination),settings:settings,commonFormat:.pcmFormatFloat32,interleaved:false)
    guard let buffer=AVAudioPCMBuffer(pcmFormat:input.processingFormat,frameCapacity:4096) else {try fail("AAC buffer allocation failed")}
    while input.framePosition<input.length {
        try input.read(into:buffer,frameCount:AVAudioFrameCount(min(4096,input.length-input.framePosition)))
        guard buffer.frameLength>0,let channels=buffer.floatChannelData else {try fail("Incomplete AAC input")}
        for ch in 0..<2 {for i in 0..<Int(buffer.frameLength) {
            guard channels[ch][i].isFinite else {try fail("Non-finite AAC sample")}
            channels[ch][i]=max(-1,min(1,channels[ch][i]))
        }}
        try output.write(from:buffer)
    }
}
// Read the final system-written packet table; do not infer gapless timing from bitrate.
func validateM4a(_ path:String) throws {
    var handle:AudioFileID?
    guard AudioFileOpenURL(URL(fileURLWithPath:path) as CFURL,.readPermission,0,&handle)==noErr,let file=handle else {try fail("Cannot open M4A packet table")}
    defer {AudioFileClose(file)}
    var format=AudioStreamBasicDescription(),table=AudioFilePacketTableInfo(),packets:UInt64=0
    var formatSize=UInt32(MemoryLayout<AudioStreamBasicDescription>.size),tableSize=UInt32(MemoryLayout<AudioFilePacketTableInfo>.size),packetsSize=UInt32(MemoryLayout<UInt64>.size)
    guard AudioFileGetProperty(file,kAudioFilePropertyDataFormat,&formatSize,&format)==noErr,
        AudioFileGetProperty(file,kAudioFilePropertyPacketTableInfo,&tableSize,&table)==noErr,
        AudioFileGetProperty(file,kAudioFilePropertyAudioDataPacketCount,&packetsSize,&packets)==noErr,
        format.mFormatID==kAudioFormatMPEG4AAC,format.mFormatFlags==0 else {try fail("M4A must contain AAC-LC with a final packet table")}
    let result:[String:Any]=["codec":"aac-lc","sampleRate":format.mSampleRate,"channels":format.mChannelsPerFrame,"framesPerPacket":format.mFramesPerPacket,"validFrames":table.mNumberValidFrames,"primingFrames":table.mPrimingFrames,"remainderFrames":table.mRemainderFrames,"packets":packets]
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject:result))
}
@main struct Main {
 static func main() async {
  do {try await run()}catch {FileHandle.standardError.write(Data((error.localizedDescription+"\n").utf8));exit(1)}
 }
 static func run() async throws {
  let args=CommandLine.arguments
  guard args.count>=3 else {try fail("Expected operation and input")}
  let operation=args[1],asset=AVURLAsset(url:URL(fileURLWithPath:args[2]))
  if operation=="probe" {
    let duration=try await asset.load(.duration).seconds,tracks=try await asset.load(.tracks)
    var channels=0,rate=0.0
    if let audio=tracks.first(where:{$0.mediaType == .audio}),let format=try await audio.load(.formatDescriptions).first,let asbd=CMAudioFormatDescriptionGetStreamBasicDescription(format){channels=Int(asbd.pointee.mChannelsPerFrame);rate=asbd.pointee.mSampleRate}
    guard duration.isFinite && duration>0 else {try fail("Unknown media duration")}
    let data=try JSONSerialization.data(withJSONObject:["path":args[2],"duration":duration,"channels":channels,"sample_rate":Int(rate),"has_video":tracks.contains{$0.mediaType == .video}]);FileHandle.standardOutput.write(data);return
  }
  if operation=="validate-m4a" {try validateM4a(args[2]);return}
  guard args.count>=4,!FileManager.default.fileExists(atPath:args[3]) else {try fail("Missing output or output exists")}
  let output=args[3]
  if operation=="encode-flac" {try encodeFlac(args[2],output);return}
  if operation=="encode-aac" {guard args.count>4,let bitrate=Int(args[4]) else {try fail("Missing AAC bitrate")};try encodeAac(args[2],output,bitrate);return}
  if operation=="thumbnail" {
    let generator=AVAssetImageGenerator(asset:asset);generator.appliesPreferredTrackTransform=true;generator.maximumSize=CGSize(width:640,height:360)
    let (image,_)=try await generator.image(at:CMTime(seconds:min(0.12,(try await asset.load(.duration).seconds)/2),preferredTimescale:60000))
    guard let destination=CGImageDestinationCreateWithURL(URL(fileURLWithPath:output) as CFURL,UTType.jpeg.identifier as CFString,1,nil) else {try fail("Cannot create thumbnail")}
    CGImageDestinationAddImage(destination,image,nil);guard CGImageDestinationFinalize(destination) else {try fail("Thumbnail failed")};return
  }
  if operation=="audio" || operation=="audio-f32" {
    guard let input=try await asset.loadTracks(withMediaType:.audio).first else {try fail("No audio track")}
    let reader=try AVAssetReader(asset:asset)
    let settings:[String:Any]=[AVFormatIDKey:kAudioFormatLinearPCM,AVSampleRateKey:48000,AVNumberOfChannelsKey:2,AVLinearPCMBitDepthKey:operation=="audio-f32" ? 32:16,AVLinearPCMIsFloatKey:operation=="audio-f32",AVLinearPCMIsBigEndianKey:false,AVLinearPCMIsNonInterleaved:false]
    let read=AVAssetReaderAudioMixOutput(audioTracks:[input],audioSettings:settings);reader.add(read)
    if operation=="audio-f32" {
      // AVAssetWriter refuses IEEE-float WAVE output. Stream reader PCM directly
      // into an owned WAV instead, without 16-bit intermediate quantization.
      let fd=Darwin.open(output,O_WRONLY|O_CREAT|O_EXCL,0o600)
      guard fd>=0 else {try fail("Cannot create float PCM staging file")}
      let file=FileHandle(fileDescriptor:fd,closeOnDealloc:true);defer {try? file.close()}
      try file.write(contentsOf:Data(count:44));var count:UInt32=0
      guard reader.startReading() else {try fail(reader.error?.localizedDescription ?? "Cannot decode float audio")}
      while let sample=read.copyNextSampleBuffer() {
        guard let block=CMSampleBufferGetDataBuffer(sample) else {try fail("Missing decoded PCM block")}
        let length=CMBlockBufferGetDataLength(block)
        guard length>0,length%8==0,UInt64(count)+UInt64(length)<=UInt64(UInt32.max)-36 else {try fail("Decoded audio exceeds float WAV limits")}
        var bytes=Data(count:length)
        let status=bytes.withUnsafeMutableBytes {raw in CMBlockBufferCopyDataBytes(block,atOffset:0,dataLength:length,destination:raw.baseAddress!)}
        guard status==kCMBlockBufferNoErr else {try fail("Cannot copy decoded float PCM")}
        try file.write(contentsOf:bytes);count+=UInt32(length)
      }
      guard reader.status == .completed else {try fail(reader.error?.localizedDescription ?? "Float PCM decoding failed")}
      var header=Data()
      func u32(_ value:UInt32) {var value=value.littleEndian;withUnsafeBytes(of:&value){header.append(contentsOf:$0)}}
      func u16(_ value:UInt16) {var value=value.littleEndian;withUnsafeBytes(of:&value){header.append(contentsOf:$0)}}
      header.append(contentsOf:"RIFF".utf8);u32(count+36);header.append(contentsOf:"WAVEfmt ".utf8);u32(16);u16(3);u16(2);u32(48000);u32(384000);u16(8);u16(32);header.append(contentsOf:"data".utf8);u32(count)
      try file.seek(toOffset:0);try file.write(contentsOf:header);return
    }
    let writer=try AVAssetWriter(outputURL:URL(fileURLWithPath:output),fileType:.wav)
    let write=AVAssetWriterInput(mediaType:.audio,outputSettings:settings);writer.add(write)
    guard writer.startWriting(),reader.startReading() else {try fail(writer.error?.localizedDescription ?? reader.error?.localizedDescription ?? "Cannot extract audio")}
    writer.startSession(atSourceTime:.zero)
    while let sample=read.copyNextSampleBuffer() {
      while !write.isReadyForMoreMediaData {
        if writer.status == .failed {throw writer.error!}
        try await Task.sleep(nanoseconds:1000000)
      }
      guard write.append(sample) else {try fail(writer.error?.localizedDescription ?? "Audio write failed")}
    }
    guard reader.status == .completed else {try fail(reader.error?.localizedDescription ?? "Audio read failed")}
    write.markAsFinished();await writer.finishWriting()
    guard writer.status == .completed else {try fail(writer.error?.localizedDescription ?? "Audio extraction failed")};return
  }
  if operation=="proxy" {
    guard let session=AVAssetExportSession(asset:asset,presetName:AVAssetExportPreset640x480) else {try fail("Unsupported Apple proxy input")}
    try await export(session,to:output,type:.mp4);return
  }
  if operation=="edit" {
    let edit=try JSONDecoder().decode(Edit.self,from:Data(contentsOf:URL(fileURLWithPath:args[2])))
    guard edit.clips.allSatisfy({PictureTransitions.names.contains($0.transition)}) else {try fail("Unsupported native picture transition")}
    let composition=AVMutableComposition();var pictures:[RenderPicture]=[]
    let duration=edit.duration ?? edit.clips.map{$0.startTime+$0.duration}.max() ?? 0
    composition.insertEmptyTimeRange(CMTimeRange(start:.zero,duration:CMTime(seconds:duration,preferredTimescale:60000)))
    let base=AVURLAsset(url:URL(fileURLWithPath:edit.path))
    guard let baseTrack=try await base.loadTracks(withMediaType:.video).first else {try fail("Missing base picture track")}
    let baseSize=try await baseTrack.load(.naturalSize),baseTransform=try await baseTrack.load(.preferredTransform)
    let baseBounds=CGRect(origin:.zero,size:baseSize).applying(baseTransform)
    let renderSize=CGSize(width:abs(baseBounds.width),height:abs(baseBounds.height))
    for clip in edit.clips {
      let path=edit.sources?.first(where:{$0.id==clip.sourceId})?.path ?? edit.path
      let source=AVURLAsset(url:URL(fileURLWithPath:path))
      guard let input=try await source.loadTracks(withMediaType:.video).first,let track=composition.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid) else {try fail("Missing picture track")}
      let preferred=try await input.load(.preferredTransform)
      try track.insertTimeRange(CMTimeRange(start:CMTime(seconds:clip.sourceOffset,preferredTimescale:60000),duration:CMTime(seconds:clip.duration,preferredTimescale:60000)),of:input,at:CMTime(seconds:clip.startTime,preferredTimescale:60000))
      pictures.append(RenderPicture(clip:clip,track:track.trackID,preferred:preferred))
    }
    let start=Double(args.count>4 ? args[4]:"0") ?? 0,end=Double(args.count>5 ? args[5]:"\(duration)") ?? duration
    if args.count>6 && !args[6].isEmpty {
      let mix=AVURLAsset(url:URL(fileURLWithPath:args[6]))
      guard let input=try await mix.loadTracks(withMediaType:.audio).first,let track=composition.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid) else {try fail("Missing mixed audio")}
      let trimmed=args.count>7 && args[7]=="true",mixDuration=try await mix.load(.duration).seconds
      let length=min(mixDuration,trimmed ? end-start:duration)
      try track.insertTimeRange(CMTimeRange(start:.zero,duration:CMTime(seconds:length,preferredTimescale:60000)),of:input,at:CMTime(seconds:trimmed ? start:0,preferredTimescale:60000))
    }
    let video=AVMutableVideoComposition();video.customVideoCompositorClass=Compositor.self
    video.renderSize=CGSize(width:floor(renderSize.width/2)*2,height:floor(renderSize.height/2)*2)
    let sourceFps=Double(try await baseTrack.load(.nominalFrameRate))
    let fps=edit.frameRate ?? (sourceFps>0 ? sourceFps:30);video.frameDuration=CMTime(seconds:1/fps,preferredTimescale:60000)
    video.instructions=[Instruction(duration:duration,pictures:pictures)]
    guard let session=AVAssetExportSession(asset:composition,presetName:AVAssetExportPresetHighestQuality) else {try fail("Apple export unavailable")}
    session.videoComposition=video;session.timeRange=CMTimeRange(start:CMTime(seconds:start,preferredTimescale:60000),duration:CMTime(seconds:end-start,preferredTimescale:60000))
    try await export(session,to:output,type:output.lowercased().hasSuffix(".mov") ? .mov:.mp4);return
  }
  try fail("Unsupported Apple operation")
 }
}
