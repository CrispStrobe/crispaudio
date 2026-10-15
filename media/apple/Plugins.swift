// MIT — Audio Unit source-effect hosting in the isolated native media helper.
import Foundation
@preconcurrency import AVFoundation
import AudioToolbox

let pluginProtocolOutput=FileHandle(fileDescriptor:dup(STDOUT_FILENO),closeOnDealloc:true)
func protectPluginOutput(){_ = pluginProtocolOutput;dup2(STDERR_FILENO,STDOUT_FILENO)}

struct PluginRequest:Decodable,Sendable {
 var id:String;var path:String?;var offset:Double?;var duration:Double?;var output:String?
 var parameters:[String:Double]?;var state:String?;var bypass:Bool?;var sampleRate:Double?;var channels:UInt32?;var processMode:String?
}
func pluginDescription(_ id:String)throws->AudioComponentDescription {
 let parts=id.split(separator:":").compactMap{UInt32($0)}
 guard parts.count==3,[kAudioUnitType_Effect,kAudioUnitType_MusicEffect].contains(parts[0]) else {try fail("Choose an Audio Unit effect")}
 return AudioComponentDescription(componentType:parts[0],componentSubType:parts[1],componentManufacturer:parts[2],componentFlags:0,componentFlagsMask:0)
}
func scanPlugins()throws {
 var values:[[String:Any]]=[]
 for type in [kAudioUnitType_Effect,kAudioUnitType_MusicEffect] {
  let desc=AudioComponentDescription(componentType:type,componentSubType:0,componentManufacturer:0,componentFlags:0,componentFlagsMask:0)
  for c in AVAudioUnitComponentManager.shared().components(matching:desc) {let d=c.audioComponentDescription;values.append(["id":"\(d.componentType):\(d.componentSubType):\(d.componentManufacturer)","name":c.name,"manufacturer":c.manufacturerName,"format":"AU"])}
 }
 pluginProtocolOutput.write(try JSONSerialization.data(withJSONObject:values.sorted{String(describing:$0["name"]!)<String(describing:$1["name"]!)}))
}
func processPlugin(_ operation:String,_ json:String)async throws {
 let data=json.hasPrefix("{") ? Data(json.utf8):try Data(contentsOf:URL(fileURLWithPath:json))
 let request=try JSONDecoder().decode(PluginRequest.self,from:data),description=try pluginDescription(request.id)
 guard !AVAudioUnitComponentManager.shared().components(matching:description).isEmpty else {try fail("Audio Unit effect is unavailable")}
 let unit=try await AVAudioUnit.instantiate(with:description,options:[])
 if let state=request.state,!state.isEmpty {guard state.count<=8_000_000,let bytes=Data(base64Encoded:state),let restored=try PropertyListSerialization.propertyList(from:bytes,format:nil) as? [String:Any] else{try fail("Invalid Audio Unit state")};unit.auAudioUnit.fullStateForDocument=restored}
 if let params=request.parameters {for (address,value) in params {guard value.isFinite,let number=UInt64(address),let parameter=unit.auAudioUnit.parameterTree?.parameter(withAddress:number),value>=Double(parameter.minValue),value<=Double(parameter.maxValue) else {try fail("Invalid Audio Unit parameter")};parameter.value=Float(value)}}
 unit.auAudioUnit.shouldBypassEffect=request.bypass ?? false
 let parameters=(unit.auAudioUnit.parameterTree?.allParameters ?? []).map{p->[String:Any] in ["address":String(p.address),"name":p.displayName,"min":p.minValue,"max":p.maxValue,"value":p.value,"unit":p.unitName ?? ""]}
 func encodedState()throws->String {let state=unit.auAudioUnit.fullStateForDocument ?? unit.auAudioUnit.fullState ?? [:];return try PropertyListSerialization.data(fromPropertyList:state,format:.binary,options:0).base64EncodedString()}
 if operation=="plugin-info"{pluginProtocolOutput.write(try JSONSerialization.data(withJSONObject:["parameters":parameters,"state":try encodedState(),"latency":unit.auAudioUnit.latency]));return}
 guard let path=request.path,let output=request.output,let offset=request.offset,let duration=request.duration,offset.isFinite,duration.isFinite,offset>=0,duration>0,duration<=120,!FileManager.default.fileExists(atPath:output) else {try fail("Invalid plugin render window or output")}
 let file=try AVAudioFile(forReading:URL(fileURLWithPath:path)),format=file.processingFormat,rate=format.sampleRate
 guard format.channelCount>0,format.channelCount<=2 else{try fail("Audio Unit source preview supports mono or stereo")}
 let frames=AVAudioFrameCount((duration*rate).rounded()),start=AVAudioFramePosition((offset*rate).rounded())
 guard start+AVAudioFramePosition(frames)<=file.length,let input=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:frames) else{try fail("Audio Unit source bounds")}
 file.framePosition=start;try file.read(into:input,frameCount:frames)
 let engine=AVAudioEngine(),player=AVAudioPlayerNode();engine.attach(player);engine.attach(unit);engine.connect(player,to:unit,format:format);engine.connect(unit,to:engine.mainMixerNode,format:format)
 unit.auAudioUnit.isRenderingOffline=true
 try engine.enableManualRenderingMode(.offline,format:format,maximumFrameCount:4096)
 player.scheduleBuffer(input,at:nil,options:[],completionCallbackType:.dataPlayedBack,completionHandler:{_ in});try engine.start();player.play();defer{player.stop();engine.stop()}
 let latency=unit.auAudioUnit.latency
 guard latency.isFinite,latency>=0,latency<=10 else{try fail("Invalid Audio Unit latency")}
 let delay=AVAudioFramePosition((latency*rate).rounded()),total=AVAudioFramePosition(frames)+delay
 guard let block=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:4096) else {try fail("Audio Unit output allocation")}
 var outputSettings=format.settings;outputSettings[AVLinearPCMIsNonInterleaved]=false
 let writer=try AVAudioFile(forWriting:URL(fileURLWithPath:output),settings:outputSettings,commonFormat:.pcmFormatFloat32,interleaved:false),limit=Date().addingTimeInterval(60)
 var rendered:AVAudioFramePosition=0,retries=0
 while rendered<total {
  guard Date()<limit else{try fail("Audio Unit render timed out")}
  let requested=AVAudioFrameCount(min(4096,total-rendered)),status=try engine.renderOffline(requested,to:block)
  if status == .cannotDoInCurrentContext {retries+=1;if retries>100{try fail("Audio Unit is not ready for offline render")};continue}
  guard status == .success || status == .insufficientDataFromInputNode,block.frameLength>0 else {try fail("Audio Unit render failed")}
  retries=0;let skip=Int(max(0,min(AVAudioFramePosition(block.frameLength),delay-rendered))),count=Int(block.frameLength)-skip
  if count>0,let kept=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:AVAudioFrameCount(count)),let source=block.floatChannelData,let destination=kept.floatChannelData {kept.frameLength=AVAudioFrameCount(count);for ch in 0..<Int(format.channelCount){for i in 0..<count {let v=source[ch][i+skip];guard v.isFinite else{try fail("Audio Unit produced invalid samples")};destination[ch][i]=v}};try writer.write(from:kept)}
  rendered+=AVAudioFramePosition(block.frameLength)
 }
 pluginProtocolOutput.write(try JSONSerialization.data(withJSONObject:["parameters":parameters,"state":try encodedState(),"latency":latency,"path":output,"frames":frames,"sampleRate":rate]))
}


// Persistent AU renderer: processing state spans packets, no temporary WAVs.
func streamRead(_ count:Int,allowEOF:Bool=false)throws->Data? {
 var data=Data();while data.count<count {guard let chunk=try FileHandle.standardInput.read(upToCount:count-data.count),!chunk.isEmpty else {if allowEOF && data.isEmpty{return nil};try fail("Plugin stream input closed")};data.append(chunk)};return data
}
func streamU32(_ data:Data,_ offset:Int)->UInt32 {(0..<4).reduce(UInt32(0)){$0 | UInt32(data[offset+$1]) << ($1*8)}}
func streamReply(_ metadata:[String:Any],_ pcm:AVAudioPCMBuffer?=nil)throws {
 let json=try JSONSerialization.data(withJSONObject:metadata);guard json.count<=16_000_000 else{try fail("Invalid stream response")};var count=UInt32(json.count).littleEndian;try pluginProtocolOutput.write(contentsOf:withUnsafeBytes(of:&count){Data($0)});try pluginProtocolOutput.write(contentsOf:json)
 if let pcm=pcm,let samples=pcm.floatChannelData {for ch in 0..<Int(pcm.format.channelCount){try pluginProtocolOutput.write(contentsOf:Data(bytes:samples[ch],count:Int(pcm.frameLength)*4))}}
}
final class PluginStreamInput {
 var buffer:AVAudioPCMBuffer?;var sampleTime:Double=0
 func fill(_ stamp:UnsafePointer<AudioTimeStamp>,_ frames:UInt32,_ bus:UInt32,_ data:UnsafeMutablePointer<AudioBufferList>?)->OSStatus {guard let input=buffer,let samples=input.floatChannelData,let data=data else{return kAudioUnitErr_NoConnection};let offset=Int(stamp.pointee.mSampleTime-sampleTime),buffers=UnsafeMutableAudioBufferListPointer(data);guard bus==0,offset>=0,offset+Int(frames)<=Int(input.frameLength),buffers.count==Int(input.format.channelCount) else{return kAudioUnitErr_InvalidParameter};for ch in 0..<buffers.count{buffers[ch].mData=UnsafeMutableRawPointer(samples[ch].advanced(by:offset));buffers[ch].mDataByteSize=frames*4;buffers[ch].mNumberChannels=1};return noErr}
}
final class PluginStreamTransport {
 var rate:Double=48000
 var projectPosition:Int64?=nil
 var position:Int64=0,tempo:Double=120,numerator:Double=4,denominator:Int=4,origin:Double=0,playing=true,changed=true,explicit=false
 func update(_ value:Any?)throws {
  guard let value=value else{if explicit{try fail("Missing stream transport")};return}
  guard let settings=value as? [String:Any] else{try fail("Invalid stream transport")}
  func number(_ key:String)throws->Double{guard let n=settings[key] as? NSNumber,CFGetTypeID(n) != CFBooleanGetTypeID(),n.doubleValue.isFinite else{try fail("Invalid transport number")};return n.doubleValue}
  let p=try number("samplePosition"),t=try number("tempo"),n=try number("numerator"),d=try number("denominator"),o=try number("originSeconds")
  guard p>=0,p<=9007199254740991-4096,p.rounded()==p,t>=20,t<=300,n>=1,n<=32,n.rounded()==n,[1.0,2,4,8,16].contains(d),o>=0,o<=86400,let moving=settings["playing"] as? NSNumber,CFGetTypeID(moving)==CFBooleanGetTypeID() else{try fail("Invalid stream transport")}
  guard !explicit || position==Int64(p) else{try fail("Transport discontinuity requires a new stream")}
  let project:Double? = settings["projectPosition"] == nil ? nil:try number("projectPosition")
  if let project=project {guard abs(project)<=9007199254736895,project.rounded()==project else{try fail("Invalid project position")}}
  changed = !explicit || playing != moving.boolValue || (project.map{Int64($0)} != projectPosition);projectPosition=project.map{Int64($0)};explicit=true;position=Int64(p);tempo=t;numerator=n;denominator=Int(d);origin=o;playing=moving.boolValue
 }
 func beat(_ rate:Double)->Double{(Double(projectPosition ?? position)/rate-origin)*tempo/60}
 func bar(_ rate:Double)->Double{let length=numerator*4/Double(denominator);return floor(beat(rate)/length)*length}
 func nextBeat(_ rate:Double)->Int{let b=beat(rate);return Int(((ceil(b)-b)*rate*60/tempo).rounded())}
 var metadata:[String:Any]{var value:[String:Any]=["samplePosition":position,"tempo":tempo,"numerator":Int(numerator),"denominator":denominator,"originSeconds":origin,"playing":playing];if let projectPosition=projectPosition{value["projectPosition"]=projectPosition};return value}
}
func streamPlugin(_ json:String)async throws {
 let data=json.hasPrefix("{") ? Data(json.utf8):try Data(contentsOf:URL(fileURLWithPath:json)),request=try JSONDecoder().decode(PluginRequest.self,from:data)
 let unit=try await AVAudioUnit.instantiate(with:pluginDescription(request.id),options:[])
 try await withCheckedThrowingContinuation { (continuation:CheckedContinuation<Void,Error>) in
  // Pipe/DSP work must not occupy a Swift cooperative executor thread.
  let worker=Thread {do {try streamPluginBody(request,unit:unit);continuation.resume()}catch{continuation.resume(throwing:error)}}
  worker.qualityOfService=request.processMode=="offline" ? .userInitiated:.userInteractive
  worker.start()
 }
}
// Dedicated DSP threads use Mach deadlines, not only interactive QoS.
func scheduleRealtimePlugin(_ rate:Double)throws {
 var base=mach_timebase_info_data_t();guard mach_timebase_info(&base)==KERN_SUCCESS,base.numer>0 else{try fail("Cannot read audio scheduling clock")}
 let period=UInt32((512_000_000_000/rate)*Double(base.denom)/Double(base.numer))
 var policy=thread_time_constraint_policy_data_t(period:period,computation:period/2,constraint:period,preemptible:1)
 let count=mach_msg_type_number_t(MemoryLayout<thread_time_constraint_policy_data_t>.size/MemoryLayout<integer_t>.size)
 let status=withUnsafeMutablePointer(to:&policy){pointer in pointer.withMemoryRebound(to:integer_t.self,capacity:Int(count)){thread_policy_set(pthread_mach_thread_np(pthread_self()),thread_policy_flavor_t(THREAD_TIME_CONSTRAINT_POLICY),$0,count)}}
 guard status==KERN_SUCCESS else{try fail("Cannot schedule real-time Audio Unit worker")}
}
func streamPluginBody(_ request:PluginRequest,unit:AVAudioUnit)throws {
 guard let rate=request.sampleRate,let channels=request.channels,rate.isFinite,rate>=8000,rate<=192000,channels==1 || channels==2,let format=AVAudioFormat(standardFormatWithSampleRate:rate,channels:channels) else{try fail("Invalid stream format")}
 guard request.processMode==nil || request.processMode=="realtime" || request.processMode=="offline" else{try fail("Invalid stream process mode")}
 let au=unit.auAudioUnit
 let activity=request.processMode=="offline" ? nil:ProcessInfo.processInfo.beginActivity(options:[.userInitiatedAllowingIdleSystemSleep,.latencyCritical],reason:"Native audio processing")
 defer {if let activity=activity {ProcessInfo.processInfo.endActivity(activity)}}
 au.isRenderingOffline=request.processMode=="offline"
 if let state=request.state,!state.isEmpty {guard state.count<=8_000_000,let bytes=Data(base64Encoded:state),let restored=try PropertyListSerialization.propertyList(from:bytes,format:nil) as? [String:Any] else{try fail("Invalid Audio Unit state")};au.fullStateForDocument=restored}
 func parameters(_ values:[String:Double])throws {for (key,value) in values {guard value.isFinite,let address=UInt64(key),let p=au.parameterTree?.parameter(withAddress:address),value>=Double(p.minValue),value<=Double(p.maxValue) else{try fail("Invalid stream parameter")};p.value=Float(value)}}
 let restoredParameters=Dictionary(uniqueKeysWithValues:(au.parameterTree?.allParameters ?? []).map{(String($0.address),Double($0.value))})
 try parameters(request.parameters ?? [:]);let audioUnit=unit.audioUnit,context=PluginStreamInput(),transport=PluginStreamTransport();transport.rate=rate;var description=format.streamDescription.pointee,maximum:UInt32=4096
 func checked(_ status:OSStatus)throws {guard status==noErr else{try fail("Cannot configure plugin stream: \(status)")}}
 try checked(AudioUnitSetProperty(audioUnit,kAudioUnitProperty_StreamFormat,kAudioUnitScope_Input,0,&description,UInt32(MemoryLayout<AudioStreamBasicDescription>.size)));try checked(AudioUnitSetProperty(audioUnit,kAudioUnitProperty_StreamFormat,kAudioUnitScope_Output,0,&description,UInt32(MemoryLayout<AudioStreamBasicDescription>.size)));try checked(AudioUnitSetProperty(audioUnit,kAudioUnitProperty_MaximumFramesPerSlice,kAudioUnitScope_Global,0,&maximum,4))
 au.musicalContextBlock={tempo,numerator,denominator,beat,next,bar in tempo?.pointee=transport.tempo;numerator?.pointee=transport.numerator;denominator?.pointee=transport.denominator;beat?.pointee=transport.beat(rate);next?.pointee=transport.nextBeat(rate);bar?.pointee=transport.bar(rate);return true}
 au.transportStateBlock={flags,position,start,end in flags?.pointee=AUHostTransportStateFlags(rawValue:(transport.playing ? 2:0)|(transport.changed ? 1:0));position?.pointee=Double(transport.projectPosition ?? transport.position);start?.pointee=0;end?.pointee=0;return true}
 var host=HostCallbackInfo(hostUserData:Unmanaged.passUnretained(transport).toOpaque(),beatAndTempoProc:{ref,beat,tempo in guard let ref=ref else{return kAudioUnitErr_CannotDoInCurrentContext};let t=Unmanaged<PluginStreamTransport>.fromOpaque(ref).takeUnretainedValue();beat?.pointee=t.beat(t.rate);tempo?.pointee=t.tempo;return noErr},musicalTimeLocationProc:{ref,next,numerator,denominator,bar in guard let ref=ref else{return kAudioUnitErr_CannotDoInCurrentContext};let t=Unmanaged<PluginStreamTransport>.fromOpaque(ref).takeUnretainedValue();next?.pointee=UInt32(t.nextBeat(t.rate));numerator?.pointee=Float(t.numerator);denominator?.pointee=UInt32(t.denominator);bar?.pointee=t.bar(t.rate);return noErr},transportStateProc:{ref,playing,changed,position,cycling,start,end in guard let ref=ref else{return kAudioUnitErr_CannotDoInCurrentContext};let t=Unmanaged<PluginStreamTransport>.fromOpaque(ref).takeUnretainedValue();playing?.pointee=DarwinBoolean(t.playing);changed?.pointee=DarwinBoolean(t.changed);position?.pointee=Double(t.projectPosition ?? t.position);cycling?.pointee=false;start?.pointee=0;end?.pointee=0;return noErr},transportStateProc2:nil)
 try checked(AudioUnitSetProperty(audioUnit,kAudioUnitProperty_HostCallbacks,kAudioUnitScope_Global,0,&host,UInt32(MemoryLayout<HostCallbackInfo>.size)))
 var callback=AURenderCallbackStruct(inputProc:{ref,_,stamp,bus,frames,data in return Unmanaged<PluginStreamInput>.fromOpaque(ref).takeUnretainedValue().fill(stamp,frames,bus,data)},inputProcRefCon:Unmanaged.passUnretained(context).toOpaque());try checked(AudioUnitSetProperty(audioUnit,kAudioUnitProperty_SetRenderCallback,kAudioUnitScope_Input,0,&callback,UInt32(MemoryLayout<AURenderCallbackStruct>.size)));try checked(AudioUnitInitialize(audioUnit));defer{AudioUnitUninitialize(audioUnit)}
 guard let warmInput=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:128),let warmOutput=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:128) else{try fail("Cannot warm plugin stream")};warmInput.frameLength=128;warmOutput.frameLength=128;for ch in 0..<Int(channels){memset(warmInput.floatChannelData![ch],0,128*4)};context.buffer=warmInput;context.sampleTime=0;var warmFlags=AudioUnitRenderActionFlags(rawValue:0),warmStamp=AudioTimeStamp();warmStamp.mSampleTime=0;warmStamp.mFlags=AudioTimeStampFlags.sampleTimeValid;try checked(AudioUnitRender(audioUnit,&warmFlags,&warmStamp,0,128,warmOutput.mutableAudioBufferList));context.buffer=nil;try checked(AudioUnitReset(audioUnit,kAudioUnitScope_Global,0))

 func metadata(_ frames:UInt32,_ sequence:UInt32,_ state:Bool)throws->[String:Any] {let latency=au.latency;guard latency.isFinite,latency>=0,latency<=10 else{try fail("Invalid stream latency")};var value:[String:Any]=["frames":frames,"sequence":sequence,"channels":channels,"sampleRate":rate,"latencySamples":Int((latency*rate).rounded()),"transport":transport.metadata,"processMode":request.processMode ?? "realtime","musicalPosition":transport.beat(rate),"barPosition":transport.bar(rate)];if state {value["restoredParameters"]=restoredParameters;value["parameters"]=(au.parameterTree?.allParameters ?? []).map{p->[String:Any] in ["address":String(p.address),"name":p.displayName,"min":p.minValue,"max":p.maxValue,"value":p.value,"unit":p.unitName ?? ""]};value["state"]=try PropertyListSerialization.data(fromPropertyList:au.fullStateForDocument ?? au.fullState ?? [:],format:.binary,options:0).base64EncodedString()};return value}
 try streamReply(metadata(0,0,true));var expected:UInt32=1;var realtimeScheduled=false
 func packet()throws->Bool {
  // Idle pause has no deadline; EOF still cleans up after the owner exits.
  alarm(0);guard let header=try streamRead(16,allowEOF:true) else{return false};alarm(5);let kind=streamU32(header,0),frames=streamU32(header,4),sequence=streamU32(header,8),length=streamU32(header,12)
  guard (kind==1 || kind==2),sequence==expected,length<=8192,frames<=4096,(kind==2 ? frames==0:frames>0) else{try fail("Invalid stream packet")};expected &+= 1
  let json=try streamRead(Int(length))!,settings=length==0 ? [:]:try JSONSerialization.jsonObject(with:json) as? [String:Any];guard let settings=settings else{try fail("Invalid stream settings")}
  if kind==2 {try streamReply(metadata(0,sequence,true));return true}
  try transport.update(settings["transport"])
  guard let input=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:frames),let output=AVAudioPCMBuffer(pcmFormat:format,frameCapacity:frames),let samples=input.floatChannelData else{try fail("Stream allocation failed")};input.frameLength=frames
  for ch in 0..<Int(channels){let data=try streamRead(Int(frames)*4)!;for i in 0..<Int(frames){let value=Float(bitPattern:streamU32(data,i*4));guard value.isFinite else{try fail("Invalid stream samples")};samples[ch][i]=value}}
  if request.processMode != "offline" && !realtimeScheduled {try scheduleRealtimePlugin(rate);realtimeScheduled=true}
  try parameters(settings["parameters"] as? [String:Double] ?? [:]);let bypass=settings["bypass"] as? Bool ?? false;let dry=bypass ? (0..<Int(channels)).map{Data(bytes:samples[$0],count:Int(frames)*4)}:[];output.frameLength=frames;var flags=AudioUnitRenderActionFlags(rawValue:0),stamp=AudioTimeStamp();stamp.mSampleTime=Double(transport.position);stamp.mFlags=AudioTimeStampFlags.sampleTimeValid
  context.buffer=input;context.sampleTime=Double(transport.position);let status=AudioUnitRender(audioUnit,&flags,&stamp,0,frames,output.mutableAudioBufferList);context.buffer=nil;guard status==noErr else{try fail("Plugin stream DSP failed: \(status)")}
  for ch in 0..<Int(channels){for i in 0..<Int(frames){if bypass{output.floatChannelData![ch][i]=Float(bitPattern:streamU32(dry[ch],i*4))};guard output.floatChannelData![ch][i].isFinite else{try fail("Invalid stream output")}}}
  try withExtendedLifetime(input){try streamReply(metadata(frames,sequence,false),output)};transport.position+=Int64(frames);if let p=transport.projectPosition{transport.projectPosition=p+Int64(frames)};transport.changed=false

  return true
 }
 // Drain Objective-C temporaries for every block, including long sessions.
 while try autoreleasepool(invoking:packet) {}
}
