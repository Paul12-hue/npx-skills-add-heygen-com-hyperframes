import SwiftUI
import Observation
import KaskadeCore

enum Screen: Hashable {
    case menu, newGame, game, puzzles, rules, stats, settings
}

/// App-wide state: navigation, profile, settings, the running game and persistence.
@Observable
@MainActor
final class AppModel {
    private(set) var screen: Screen = .menu
    private(set) var game: GameController?
    private(set) var savedSnapshot: MatchSnapshot?
    /// Shown on the rules screen when opened from a running game.
    private(set) var rulesReturnScreen: Screen = .menu

    var profile: Profile {
        didSet { persistence.save(profile) }
    }

    var settings: Settings {
        didSet {
            persistence.save(settings)
            applySettings()
        }
    }

    var palette: SkinPalette { SkinPalette.forSkin(settings.skinID) }

    @ObservationIgnored let sound: SoundEngine
    @ObservationIgnored let haptics = Haptics()
    @ObservationIgnored private let persistence: Persistence

    init(persistence: Persistence = AppModel.defaultPersistence()) {
        self.persistence = persistence
        profile = persistence.loadProfile()
        var loaded = persistence.loadSettings()
        if !StoneSkin.catalog.contains(where: { $0.id == loaded.skinID }) { loaded.skinID = "ember" }
        if ProcessInfo.processInfo.arguments.contains("-uiTesting") {
            loaded.soundEnabled = false
            loaded.musicEnabled = false
        }
        settings = loaded
        sound = SoundEngine()
        if let level = Self.launchValue("-uiTestingLevel").flatMap(Int.init) {
            profile.xp = Profile.xpRequired(for: level)
        }
        // A saved game is only offered if it still replays cleanly.
        if let snap = persistence.loadMatch() {
            if (try? Match(snapshot: snap)) != nil, !((try? Match(snapshot: snap))?.isOver ?? true) {
                savedSnapshot = snap
            } else {
                persistence.clearMatch()
            }
        }
        applySettings()
    }

    static func defaultPersistence() -> Persistence {
        ProcessInfo.processInfo.arguments.contains("-uiTesting") ? .ephemeral() : .standard()
    }

    private static func launchValue(_ key: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: key), i + 1 < args.count else { return nil }
        return args[i + 1]
    }

    private func applySettings() {
        sound.effectsEnabled = settings.soundEnabled
        if sound.musicEnabled != settings.musicEnabled { sound.musicEnabled = settings.musicEnabled }
        haptics.enabled = settings.hapticsEnabled
    }

    // MARK: Navigation

    func show(_ target: Screen) {
        sound.play(.tap)
        if target == .rules { rulesReturnScreen = screen == .game ? .game : .menu }
        withAnimation(.easeInOut(duration: 0.35)) { screen = target }
    }

    func closeRules() { show(rulesReturnScreen) }

    // MARK: Games

    func startMatch(_ config: MatchConfig) {
        guard let match = try? Match(config: config) else { return }
        settings.lastArenaID = config.arenaID
        if let d = config.difficulty, config.mode == .versusAI { settings.lastDifficulty = d }
        if config.mode == .versusAI { settings.humanPlaysSun = config.aiPlayer == .moon }
        let controller = GameController(app: self, match: match, kind: .standard)
        present(controller)
        persist(controller.match)
    }

    func resumeSavedMatch() {
        guard let snap = savedSnapshot, let match = try? Match(snapshot: snap) else {
            discardSavedMatch()
            return
        }
        present(GameController(app: self, match: match, kind: .standard))
    }

    func discardSavedMatch() {
        savedSnapshot = nil
        persistence.clearMatch()
    }

    func startTutorial() {
        present(GameController.tutorial(app: self))
    }

    func startPuzzle(_ puzzle: Puzzle) {
        guard let controller = GameController.puzzle(app: self, puzzle: puzzle) else { return }
        present(controller)
    }

    private func present(_ controller: GameController) {
        game?.tearDown()
        game = controller
        show(.game)
        controller.begin()
    }

    /// Leaves the game screen. Standard games stay saved and can be resumed.
    func leaveGame() {
        if let g = game, g.kind == .standard, !g.match.isOver { persist(g.match) }
        game?.tearDown()
        let destination: Screen
        switch game?.kind {
        case .puzzle: destination = .puzzles
        default: destination = .menu
        }
        game = nil
        show(destination)
    }

    func persist(_ match: Match) {
        guard [.versusAI, .localDuel, .training].contains(match.config.mode) else { return }
        if match.isOver {
            discardSavedMatch()
        } else {
            let snap = match.snapshot
            savedSnapshot = snap
            persistence.save(snap)
        }
    }

    func appDidEnterBackground() {
        if let g = game {
            if g.kind == .standard { persist(g.match) }
            g.pauseForInterruption()
        }
    }

    func appDidBecomeActive() {
        sound.resume()
    }

    // MARK: Progress

    func record(_ summary: MatchSummary) -> Reward {
        profile.record(summary)
    }

    func recordPuzzle(_ id: String) -> Reward {
        profile.recordPuzzleSolved(id)
    }

    func completeTutorial() {
        if !profile.tutorialCompleted { profile.tutorialCompleted = true }
    }

    func resetProgress() {
        game?.tearDown()
        game = nil
        profile = Profile()
        settings = Settings()
        discardSavedMatch()
    }
}
