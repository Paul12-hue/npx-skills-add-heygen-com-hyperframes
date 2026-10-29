/// Cosmetic stone designs. Pure data: the app maps the id to colors.
public struct StoneSkin: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String
    public let unlockLevel: Int

    public static let catalog: [StoneSkin] = [
        StoneSkin(id: "ember", name: "Glut & Gletscher", unlockLevel: 1),
        StoneSkin(id: "coral", name: "Koralle & Jade", unlockLevel: 2),
        StoneSkin(id: "aurum", name: "Gold & Obsidian", unlockLevel: 4),
        StoneSkin(id: "aurora", name: "Polarlicht", unlockLevel: 6),
        StoneSkin(id: "nebula", name: "Nebel & Nova", unlockLevel: 8),
    ]
}

public enum Achievement: String, Codable, CaseIterable, Sendable, Identifiable {
    case firstVictory, strategistDefeated, masterDefeated, grandmasterDefeated
    case geyserFinish, riftFinish, purist, crystalHoarder
    case streakThree, puzzleSolver, puzzleMaster, duelist

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .firstVictory: return "Erster Sieg"
        case .strategistDefeated: return "Weitsicht"
        case .masterDefeated: return "Meisterprüfung"
        case .grandmasterDefeated: return "Großmeister-Bezwinger"
        case .geyserFinish: return "Ausbruch"
        case .riftFinish: return "Durchbruch"
        case .purist: return "Purist"
        case .crystalHoarder: return "Kristallsammler"
        case .streakThree: return "Lauf"
        case .puzzleSolver: return "Denker"
        case .puzzleMaster: return "Rätselmeister"
        case .duelist: return "Duellant"
        }
    }

    public var detail: String {
        switch self {
        case .firstVictory: return "Gewinne deine erste Partie gegen die KI."
        case .strategistDefeated: return "Besiege den Strategen."
        case .masterDefeated: return "Besiege den Meister."
        case .grandmasterDefeated: return "Besiege den Großmeister."
        case .geyserFinish: return "Gewinne mit einem Geysir-Zug."
        case .riftFinish: return "Gewinne direkt nach einem Spalt."
        case .purist: return "Gewinne in einer Fähigkeits-Arena, ohne eine Fähigkeit zu nutzen (ab Stratege)."
        case .crystalHoarder: return "Sammle 3 Kristalle in einer Partie."
        case .streakThree: return "Gewinne 3 Partien gegen die KI in Folge."
        case .puzzleSolver: return "Löse dein erstes Rätsel."
        case .puzzleMaster: return "Löse alle Rätsel."
        case .duelist: return "Spiele 5 lokale Duelle."
        }
    }
}

public struct RecordCount: Codable, Hashable, Sendable {
    public var wins = 0
    public var losses = 0
    public var draws = 0
    public var total: Int { wins + losses + draws }
    public init() {}
}

public struct Statistics: Codable, Hashable, Sendable {
    public var versusAI: [String: RecordCount] = [:]
    public var duelsPlayed = 0
    public var duelWinsSun = 0
    public var duelWinsMoon = 0
    public var duelDraws = 0
    public var currentStreak = 0
    public var bestStreak = 0
    public var abilitiesUsed: [String: Int] = [:]
    public var crystalsCollected = 0
    public var totalTurns = 0
    public init() {}

    public func record(for d: Difficulty) -> RecordCount { versusAI[d.rawValue] ?? RecordCount() }

    public var gamesPlayed: Int { versusAI.values.map(\.total).reduce(0, +) + duelsPlayed }
}

/// Summary of a finished match, produced by the app and fed into `Profile.record`.
public struct MatchSummary: Sendable, Equatable {
    public var mode: GameMode
    public var arenaID: String
    public var difficulty: Difficulty?
    /// The local human side vs AI (nil in duels).
    public var humanPlayer: Player?
    public var outcome: Outcome
    public var decisiveMove: Move?
    public var humanAbilityUses: [Ability: Int]
    public var humanCrystals: Int
    public var humanTurns: Int
    public var undoCount: Int
    /// The winning drop directly followed a rift.
    public var finishedAfterRift: Bool

    public init(mode: GameMode, arenaID: String, difficulty: Difficulty?, humanPlayer: Player?, outcome: Outcome,
                decisiveMove: Move?, humanAbilityUses: [Ability: Int], humanCrystals: Int, humanTurns: Int, undoCount: Int,
                finishedAfterRift: Bool = false) {
        self.finishedAfterRift = finishedAfterRift
        self.mode = mode
        self.arenaID = arenaID
        self.difficulty = difficulty
        self.humanPlayer = humanPlayer
        self.outcome = outcome
        self.decisiveMove = decisiveMove
        self.humanAbilityUses = humanAbilityUses
        self.humanCrystals = humanCrystals
        self.humanTurns = humanTurns
        self.undoCount = undoCount
    }

    public init(match: Match) {
        let human = match.config.aiPlayer?.opponent
        let side = human ?? .sun
        self.init(mode: match.config.mode, arenaID: match.config.arenaID, difficulty: match.config.difficulty,
                  humanPlayer: human, outcome: match.state.outcome, decisiveMove: match.decisiveMove,
                  humanAbilityUses: human.map { match.abilityUses(for: $0) } ?? [:],
                  humanCrystals: match.crystalsClaimed(by: side), humanTurns: match.turnCount(for: side),
                  undoCount: match.undoCount,
                  finishedAfterRift: match.history.count >= 2 && match.history[match.history.count - 2].kind == .rift)
    }

    public var humanWon: Bool {
        guard let h = humanPlayer, case .win(let p) = outcome else { return false }
        return p == h
    }
}

public struct Reward: Sendable, Equatable {
    public var xpGained: Int
    public var levelBefore: Int
    public var levelAfter: Int
    public var newAchievements: [Achievement]
    public var unlockedArenas: [Arena]
    public var unlockedSkins: [StoneSkin]

    public static let none = Reward(xpGained: 0, levelBefore: 1, levelAfter: 1, newAchievements: [], unlockedArenas: [], unlockedSkins: [])
}

/// Persistent player progress.
public struct Profile: Codable, Hashable, Sendable {
    public var xp = 0
    public var stats = Statistics()
    public var achievements: Set<String> = []
    public var solvedPuzzles: Set<String> = []
    public var tutorialCompleted = false
    public init() {}

    enum CodingKeys: String, CodingKey { case xp, stats, achievements, solvedPuzzles, tutorialCompleted }

    /// Missing keys fall back to defaults, so older save files keep loading after updates.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        xp = max(0, try c.decodeIfPresent(Int.self, forKey: .xp) ?? 0)
        stats = try c.decodeIfPresent(Statistics.self, forKey: .stats) ?? Statistics()
        achievements = try c.decodeIfPresent(Set<String>.self, forKey: .achievements) ?? []
        solvedPuzzles = try c.decodeIfPresent(Set<String>.self, forKey: .solvedPuzzles) ?? []
        tutorialCompleted = try c.decodeIfPresent(Bool.self, forKey: .tutorialCompleted) ?? false
    }

    // MARK: Levels

    /// Total XP needed to reach `level` (level 1 = 0 XP, then 100, 250, 450, …).
    public static func xpRequired(for level: Int) -> Int {
        guard level > 1 else { return 0 }
        let n = level - 1
        return 50 * n * (n + 3) / 2
    }

    public static func level(forXP xp: Int) -> Int {
        var level = 1
        while xpRequired(for: level + 1) <= xp { level += 1 }
        return level
    }

    public var level: Int { Self.level(forXP: xp) }

    /// Progress (0…1) inside the current level.
    public var levelProgress: Double {
        let lo = Self.xpRequired(for: level)
        let hi = Self.xpRequired(for: level + 1)
        return Double(xp - lo) / Double(hi - lo)
    }

    public func isUnlocked(_ arena: Arena) -> Bool { level >= arena.unlockLevel }
    public func isUnlocked(_ skin: StoneSkin) -> Bool { level >= skin.unlockLevel }
    public func has(_ a: Achievement) -> Bool { achievements.contains(a.rawValue) }

    // MARK: XP rules

    public static func xp(for summary: MatchSummary) -> Int {
        switch summary.mode {
        case .versusAI:
            let base: Int
            switch summary.difficulty ?? .apprentice {
            case .apprentice: base = 20
            case .strategist: base = 35
            case .master: base = 55
            case .grandmaster: base = 80
            }
            var xp: Int
            switch summary.outcome {
            case .win(let p): xp = p == summary.humanPlayer ? base : 8
            case .draw: xp = base / 2
            case .ongoing: xp = 0
            }
            if summary.undoCount > 0 { xp /= 2 }
            return xp
        case .localDuel: return summary.outcome == .ongoing ? 0 : 15
        case .training, .puzzle, .tutorial: return 0
        }
    }

    // MARK: Recording

    /// Applies a finished rated match. Returns what was earned.
    @discardableResult
    public mutating func record(_ summary: MatchSummary) -> Reward {
        guard summary.mode.isRated, summary.outcome.isOver else { return .none }
        let before = level
        let gained = Self.xp(for: summary)
        xp += gained
        stats.totalTurns += summary.humanTurns
        for (ability, n) in summary.humanAbilityUses { stats.abilitiesUsed[ability.rawValue, default: 0] += n }
        stats.crystalsCollected += summary.humanCrystals

        var earned: [Achievement] = []
        func grant(_ a: Achievement) {
            if achievements.insert(a.rawValue).inserted { earned.append(a) }
        }

        if summary.mode == .versusAI, let d = summary.difficulty {
            var r = stats.record(for: d)
            switch summary.outcome {
            case .win(let p) where p == summary.humanPlayer:
                r.wins += 1
                stats.currentStreak += 1
                stats.bestStreak = max(stats.bestStreak, stats.currentStreak)
            case .win:
                r.losses += 1
                stats.currentStreak = 0
            default:
                r.draws += 1
                stats.currentStreak = 0
            }
            stats.versusAI[d.rawValue] = r

            if summary.humanWon && summary.undoCount == 0 {
                grant(.firstVictory)
                switch d {
                case .apprentice: break
                case .strategist: grant(.strategistDefeated)
                case .master: grant(.masterDefeated)
                case .grandmaster: grant(.grandmasterDefeated)
                }
                if summary.decisiveMove?.kind == .geyser { grant(.geyserFinish) }
                if let arena = Arena.named(summary.arenaID), arena.abilitiesEnabled,
                   d != .apprentice, summary.humanAbilityUses.values.reduce(0, +) == 0 {
                    grant(.purist)
                }
                if summary.finishedAfterRift { grant(.riftFinish) }
            }
            if stats.currentStreak >= 3 { grant(.streakThree) }
        } else if summary.mode == .localDuel {
            stats.duelsPlayed += 1
            switch summary.outcome {
            case .win(.sun): stats.duelWinsSun += 1
            case .win(.moon): stats.duelWinsMoon += 1
            default: stats.duelDraws += 1
            }
            if stats.duelsPlayed >= 5 { grant(.duelist) }
        }
        if summary.humanCrystals >= 3 && summary.undoCount == 0 { grant(.crystalHoarder) }

        return makeReward(gained: gained, levelBefore: before, earned: earned)
    }

    /// Marks a puzzle as solved. XP is granted only the first time.
    @discardableResult
    public mutating func recordPuzzleSolved(_ id: String) -> Reward {
        let before = level
        guard solvedPuzzles.insert(id).inserted else {
            return Reward(xpGained: 0, levelBefore: before, levelAfter: before, newAchievements: [], unlockedArenas: [], unlockedSkins: [])
        }
        xp += 30
        var earned: [Achievement] = []
        if achievements.insert(Achievement.puzzleSolver.rawValue).inserted { earned.append(.puzzleSolver) }
        if Puzzle.catalog.allSatisfy({ solvedPuzzles.contains($0.id) }),
           achievements.insert(Achievement.puzzleMaster.rawValue).inserted {
            earned.append(.puzzleMaster)
        }
        return makeReward(gained: 30, levelBefore: before, earned: earned)
    }

    private func makeReward(gained: Int, levelBefore: Int, earned: [Achievement]) -> Reward {
        let after = level
        let arenas = Arena.catalog.filter { $0.unlockLevel > levelBefore && $0.unlockLevel <= after }
        let skins = StoneSkin.catalog.filter { $0.unlockLevel > levelBefore && $0.unlockLevel <= after }
        return Reward(xpGained: gained, levelBefore: levelBefore, levelAfter: after, newAchievements: earned,
                      unlockedArenas: arenas, unlockedSkins: skins)
    }
}

/// User preferences.
public struct Settings: Codable, Hashable, Sendable {
    public var soundEnabled = true
    public var musicEnabled = false
    public var hapticsEnabled = true
    public var showColumnHints = true
    public var reduceMotion = false
    /// Rotates the moon panel by 180° in local duels so two players can sit face to face.
    public var tableMode = false
    public var skinID = "ember"
    public var sunName = "Sonne"
    public var moonName = "Mond"
    public var lastDifficulty: Difficulty = .strategist
    public var lastArenaID = Arena.origin.id
    public var humanPlaysSun = true
    public init() {}

    enum CodingKeys: String, CodingKey {
        case soundEnabled, musicEnabled, hapticsEnabled, showColumnHints, reduceMotion, tableMode
        case skinID, sunName, moonName, lastDifficulty, lastArenaID, humanPlaysSun
    }

    /// Missing or unknown values fall back to defaults instead of failing.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let d = Settings()
        soundEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .soundEnabled)) ?? d.soundEnabled
        musicEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .musicEnabled)) ?? d.musicEnabled
        hapticsEnabled = (try? c.decodeIfPresent(Bool.self, forKey: .hapticsEnabled)) ?? d.hapticsEnabled
        showColumnHints = (try? c.decodeIfPresent(Bool.self, forKey: .showColumnHints)) ?? d.showColumnHints
        reduceMotion = (try? c.decodeIfPresent(Bool.self, forKey: .reduceMotion)) ?? d.reduceMotion
        tableMode = (try? c.decodeIfPresent(Bool.self, forKey: .tableMode)) ?? d.tableMode
        skinID = (try? c.decodeIfPresent(String.self, forKey: .skinID)) ?? d.skinID
        sunName = (try? c.decodeIfPresent(String.self, forKey: .sunName)) ?? d.sunName
        moonName = (try? c.decodeIfPresent(String.self, forKey: .moonName)) ?? d.moonName
        lastDifficulty = (try? c.decodeIfPresent(Difficulty.self, forKey: .lastDifficulty)) ?? d.lastDifficulty
        lastArenaID = (try? c.decodeIfPresent(String.self, forKey: .lastArenaID)) ?? d.lastArenaID
        humanPlaysSun = (try? c.decodeIfPresent(Bool.self, forKey: .humanPlaysSun)) ?? d.humanPlaysSun
    }
}
