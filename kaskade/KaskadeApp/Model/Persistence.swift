import Foundation
import KaskadeCore

/// JSON files in Application Support. Writes are atomic, so a crash mid-write never corrupts a file.
/// Unreadable files are moved aside (".corrupt") and replaced by defaults instead of crashing.
struct Persistence {
    let directory: URL

    static func standard() -> Persistence {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return Persistence(directory: base.appendingPathComponent("Kaskade", isDirectory: true))
    }

    /// Isolated store for UI tests. `-uiTestingPersist` keeps one fixed folder across launches
    /// (to test restoring after a restart); `-uiTestingReset` wipes it first.
    static func ephemeral(arguments: [String] = ProcessInfo.processInfo.arguments) -> Persistence {
        let tmp = FileManager.default.temporaryDirectory
        if arguments.contains("-uiTestingPersist") {
            let dir = tmp.appendingPathComponent("Kaskade-UITest", isDirectory: true)
            if arguments.contains("-uiTestingReset") { try? FileManager.default.removeItem(at: dir) }
            return Persistence(directory: dir)
        }
        return Persistence(directory: tmp.appendingPathComponent("Kaskade-\(UUID().uuidString)", isDirectory: true))
    }

    private var profileURL: URL { directory.appendingPathComponent("profile.json") }
    private var settingsURL: URL { directory.appendingPathComponent("settings.json") }
    private var matchURL: URL { directory.appendingPathComponent("saved-match.json") }

    func loadProfile() -> Profile { load(Profile.self, from: profileURL) ?? Profile() }
    func loadSettings() -> Settings { load(Settings.self, from: settingsURL) ?? Settings() }
    func loadMatch() -> MatchSnapshot? { load(MatchSnapshot.self, from: matchURL) }

    func save(_ profile: Profile) { write(profile, to: profileURL) }
    func save(_ settings: Settings) { write(settings, to: settingsURL) }
    func save(_ match: MatchSnapshot) { write(match, to: matchURL) }

    func clearMatch() { try? FileManager.default.removeItem(at: matchURL) }

    func resetAll() {
        for url in [profileURL, settingsURL, matchURL] { try? FileManager.default.removeItem(at: url) }
    }

    private func load<T: Decodable>(_ type: T.Type, from url: URL) -> T? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            print("Could not read \(url.lastPathComponent): \(error). Moving it aside.")
            let aside = url.appendingPathExtension("corrupt")
            try? FileManager.default.removeItem(at: aside)
            try? FileManager.default.moveItem(at: url, to: aside)
            return nil
        }
    }

    private func write<T: Encodable>(_ value: T, to url: URL) {
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(value).write(to: url, options: [.atomic])
        } catch {
            print("Could not save \(url.lastPathComponent): \(error)")
        }
    }
}
