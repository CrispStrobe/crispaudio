// CrispAudio native iOS integrations, invoked from the web layer as
// `plugin:crispaudio-native|<command>`:
//
//   shareFile   present the share sheet (Save to Files, AirDrop, Messages, …)
//   haptic      tactile feedback for transport and editing actions
import AVFoundation
import Tauri
import UIKit
import WebKit

class ShareFileArgs: Decodable {
    let path: String
}

class HapticArgs: Decodable {
    let style: String
}

struct ShareResult: Encodable {
    let completed: Bool
    let activity: String?
}

class CrispAudioNativePlugin: Plugin {
    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

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
