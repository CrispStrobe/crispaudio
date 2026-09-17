// CrispAudio native iOS integrations, invoked from the web layer as
// `plugin:crispaudio-native|<command>`:
//
//   listVoices  the system speech voices installed on this device
//   synthesize  render text to a 16-bit PCM WAV with AVSpeechSynthesizer —
//               entirely on-device, no network, no model download
//   shareFile   present the share sheet (Save to Files, AirDrop, Messages, …)
//   haptic      tactile feedback for transport and editing actions
import AVFoundation
import Tauri
import UIKit
import WebKit

class SynthesizeArgs: Decodable {
    let text: String
    let voiceId: String?
    let language: String?
    /// Speaking-rate multiplier; 1.0 is the system default rate.
    let rate: Double?
    /// Pitch multiplier, 0.5 … 2.0.
    let pitch: Double?
}

class ShareFileArgs: Decodable {
    let path: String
}

class HapticArgs: Decodable {
    let style: String
}

struct VoiceInfo: Encodable {
    let id: String
    let name: String
    let language: String
    /// "default", "enhanced" or "premium".
    let quality: String
    let novelty: Bool
}

struct VoiceList: Encodable {
    let voices: [VoiceInfo]
}

struct SynthesisResult: Encodable {
    let wavBase64: String
    let sampleRate: Double
    let durationSeconds: Double
}

struct ShareResult: Encodable {
    let completed: Bool
    let activity: String?
}

/// One text-to-WAV render. AVSpeechSynthesizer.write delivers PCM buffers
/// until an empty buffer marks the end; the delegate's didFinish/didCancel
/// are a second end signal, since not every iOS release sends the empty one.
private final class SpeechRender: NSObject, AVSpeechSynthesizerDelegate {
    private let synthesizer = AVSpeechSynthesizer()
    private let queue = DispatchQueue(label: "com.crispstrobe.crispaudio.speech")
    private var samples: [Int16] = []
    private var sampleRate: Double = 22050
    private var finished = false
    private let completion: (Result<SynthesisResult, Error>) -> Void

    init(completion: @escaping (Result<SynthesisResult, Error>) -> Void) {
        self.completion = completion
        super.init()
        synthesizer.delegate = self
    }

    func start(_ utterance: AVSpeechUtterance) {
        synthesizer.write(utterance) { [weak self] buffer in
            guard let self = self, let pcm = buffer as? AVAudioPCMBuffer else { return }
            self.queue.async {
                if pcm.frameLength == 0 {
                    self.finish(cancelled: false)
                } else {
                    self.append(pcm)
                }
            }
        }
    }

    private func append(_ pcm: AVAudioPCMBuffer) {
        sampleRate = pcm.format.sampleRate
        let frames = Int(pcm.frameLength)
        // Mix down to mono; the system voices are mono in practice.
        let channels = Int(pcm.format.channelCount)
        if let int16 = pcm.int16ChannelData {
            for i in 0..<frames {
                var acc = 0
                for c in 0..<channels { acc += Int(int16[c][i]) }
                samples.append(Int16(acc / max(channels, 1)))
            }
        } else if let float = pcm.floatChannelData {
            for i in 0..<frames {
                var acc: Float = 0
                for c in 0..<channels { acc += float[c][i] }
                let v = max(-1, min(1, acc / Float(max(channels, 1))))
                samples.append(Int16(v * 32767))
            }
        }
    }

    private func finish(cancelled: Bool) {
        guard !finished else { return }
        finished = true
        if cancelled || samples.isEmpty {
            completion(.failure(NSError(
                domain: "CrispAudioNative", code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Speech synthesis produced no audio"])))
            return
        }
        let wav = SpeechRender.encodeWav(samples, sampleRate: Int(sampleRate))
        completion(.success(SynthesisResult(
            wavBase64: wav.base64EncodedString(),
            sampleRate: sampleRate,
            durationSeconds: Double(samples.count) / sampleRate)))
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        // Let any buffers still queued land before closing the render.
        queue.async { self.finish(cancelled: false) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        queue.async { self.finish(cancelled: true) }
    }

    static func encodeWav(_ samples: [Int16], sampleRate: Int) -> Data {
        var data = Data()
        func put32(_ v: UInt32) { var le = v.littleEndian; data.append(Data(bytes: &le, count: 4)) }
        func put16(_ v: UInt16) { var le = v.littleEndian; data.append(Data(bytes: &le, count: 2)) }
        let dataSize = UInt32(samples.count * 2)
        data.append(contentsOf: Array("RIFF".utf8)); put32(36 + dataSize)
        data.append(contentsOf: Array("WAVE".utf8))
        data.append(contentsOf: Array("fmt ".utf8)); put32(16)
        put16(1)                          // PCM
        put16(1)                          // mono
        put32(UInt32(sampleRate))
        put32(UInt32(sampleRate * 2))     // byte rate
        put16(2)                          // block align
        put16(16)                         // bits per sample
        data.append(contentsOf: Array("data".utf8)); put32(dataSize)
        samples.withUnsafeBufferPointer { ptr in
            for s in ptr { put16(UInt16(bitPattern: s)) }
        }
        return data
    }
}

class CrispAudioNativePlugin: Plugin {
    /// Renders in flight, retained until they complete.
    private var renders: [ObjectIdentifier: SpeechRender] = [:]
    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    @objc public func listVoices(_ invoke: Invoke) {
        let voices = AVSpeechSynthesisVoice.speechVoices().map { voice -> VoiceInfo in
            let quality: String
            switch voice.quality {
            case .enhanced: quality = "enhanced"
            case .premium: quality = "premium"
            default: quality = "default"
            }
            var novelty = false
            if #available(iOS 17.0, *) {
                novelty = voice.voiceTraits.contains(.isNoveltyVoice)
            }
            return VoiceInfo(id: voice.identifier, name: voice.name, language: voice.language,
                             quality: quality, novelty: novelty)
        }
        invoke.resolve(VoiceList(voices: voices))
    }

    @objc public func synthesize(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SynthesizeArgs.self)
        let text = args.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            invoke.reject("No text to synthesize")
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        if let id = args.voiceId, let voice = AVSpeechSynthesisVoice(identifier: id) {
            utterance.voice = voice
        } else if let lang = args.language {
            utterance.voice = AVSpeechSynthesisVoice(language: lang)
        }
        let multiplier = Float(args.rate ?? 1.0)
        utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate,
                             max(AVSpeechUtteranceMinimumSpeechRate,
                                 AVSpeechUtteranceDefaultSpeechRate * multiplier))
        utterance.pitchMultiplier = Float(min(2.0, max(0.5, args.pitch ?? 1.0)))

        DispatchQueue.main.async {
            var key: ObjectIdentifier?
            let render = SpeechRender { [weak self] result in
                DispatchQueue.main.async {
                    if let key = key { self?.renders.removeValue(forKey: key) }
                    switch result {
                    case .success(let output): invoke.resolve(output)
                    case .failure(let error): invoke.reject(error.localizedDescription)
                    }
                }
            }
            key = ObjectIdentifier(render)
            self.renders[key!] = render
            render.start(utterance)
        }
    }

    @objc public func shareFile(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(ShareFileArgs.self)
        let url = URL(fileURLWithPath: args.path)
        guard FileManager.default.fileExists(atPath: url.path) else {
            invoke.reject("File to share does not exist")
            return
        }

        DispatchQueue.main.async {
            guard let root = self.manager.viewController else {
                invoke.reject("No view controller to present the share sheet from")
                return
            }
            var presenter: UIViewController = root
            while let presented = presenter.presentedViewController { presenter = presented }

            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.completionWithItemsHandler = { activity, completed, _, error in
                try? FileManager.default.removeItem(at: url)
                if let error = error {
                    invoke.reject(error.localizedDescription)
                } else {
                    invoke.resolve(ShareResult(completed: completed, activity: activity?.rawValue))
                }
            }
            // iPad presents the sheet as a popover, which needs an anchor.
            if let popover = sheet.popoverPresentationController {
                popover.sourceView = presenter.view
                popover.sourceRect = CGRect(x: presenter.view.bounds.midX,
                                            y: presenter.view.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            presenter.present(sheet, animated: true)
        }
    }

    @objc public func haptic(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(HapticArgs.self)
        DispatchQueue.main.async {
            switch args.style {
            case "light": self.impactLight.impactOccurred()
            case "medium": self.impactMedium.impactOccurred()
            case "selection": self.selection.selectionChanged()
            case "success": self.notification.notificationOccurred(.success)
            case "warning": self.notification.notificationOccurred(.warning)
            case "error": self.notification.notificationOccurred(.error)
            default: break
            }
            invoke.resolve()
        }
    }
}

@_cdecl("init_plugin_crispaudio_native")
func initPlugin() -> Plugin {
    return CrispAudioNativePlugin()
}
