import AppKit
import UserNotifications

// usagefleet-notifier <title> <body> <url> posts one notification and exits.
// A click on it relaunches the app with no arguments and delivers the response.
final class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {
	func applicationDidFinishLaunching(_: Notification) {
		let center = UNUserNotificationCenter.current()
		center.delegate = self
		// The first-run permission prompt holds requestAuthorization open until answered.
		DispatchQueue.main.asyncAfter(deadline: .now() + 600) { exit(0) }
		let args = Array(CommandLine.arguments.dropFirst())
		guard args.count == 3 else { return }

		center.requestAuthorization(options: [.alert]) { granted, _ in
			guard granted else { exit(0) }
			let content = UNMutableNotificationContent()
			content.title = args[0]
			content.body = args[1]
			content.userInfo = ["url": args[2]]
			// Same title, same request id: a newer alert for a window replaces the older one.
			let request = UNNotificationRequest(identifier: args[0], content: content, trigger: nil)
			center.add(request) { _ in exit(0) }
		}
	}

	func userNotificationCenter(
		_: UNUserNotificationCenter,
		didReceive response: UNNotificationResponse,
		withCompletionHandler done: @escaping () -> Void
	) {
		if let link = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: link) {
			NSWorkspace.shared.open(url)
		}
		done()
		exit(0)
	}
}

let delegate = AppDelegate()
NSApplication.shared.delegate = delegate
NSApplication.shared.setActivationPolicy(.accessory)
NSApplication.shared.run()
