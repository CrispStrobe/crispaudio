// MIT — Audio Unit source-effect hosting in the isolated native media helper.
import Foundation
import AVFoundation
import AudioToolbox

let pluginProtocolOutput=FileHandle(fileDescriptor:dup(STDOUT_FILENO),closeOnDealloc:true)
func protectPluginOutput(){_ = pluginProtocolOutput;dup2(STDERR_FILENO,STDOUT_FILENO)}

struct PluginRequest:Decodable {
 var id:String;var path:String?;var offset:Double?;var duration:Double?;var output:String?
 var parameters:[String:Double]?;var state:String?;var bypass:Bool?
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
