import Foundation
import XCTest
@testable import KaskadeCore

final class PuzzleTests: XCTestCase {
    func testPuzzlesAreWellFormed() {
        XCTAssertEqual(Set(Puzzle.catalog.map(\.id)).count, Puzzle.catalog.count)
        for p in Puzzle.catalog {
            XCTAssertTrue(p.isGravityConsistent, p.id)
            XCTAssertEqual(Set(p.layout.map(\.count)).count, 1, "\(p.id) rows must have equal length")
            XCTAssertEqual(p.makeState().outcome, .ongoing, p.id)
        }
    }

    func testEveryPuzzleHasForcedWinInStatedTurns() {
        for p in Puzzle.catalog {
            let s = p.makeState()
            XCTAssertTrue(Solver.hasForcedWin(s, turns: p.turns), "\(p.id) not solvable in \(p.turns)")
            if p.turns > 1 {
                XCTAssertFalse(Solver.hasForcedWin(s, turns: p.turns - 1), "\(p.id) solvable faster")
            }
        }
    }

    func testAbilityPuzzlesCannotBeSolvedByPlainDrops() {
        for p in Puzzle.catalog where p.abilitiesEnabled {
            var s = p.makeState()
            s = GameState(geometry: s.geometry, sun: s.sun, moon: s.moon, neutral: s.neutral, crystals: s.crystals,
                          energySun: 0, energyMoon: 0, toMove: s.toMove)
            XCTAssertFalse(Solver.hasForcedWin(s, turns: p.turns), "\(p.id) should need an ability")
        }
    }

    func testSolverRejectsWrongMoves() {
        let s = Puzzle.named("p02")!.makeState()
        var wrong = s
        wrong.apply(.drop(6))
        // After a wasted move moon can defend.
        XCTAssertFalse(Solver.hasForcedWin({ var w = wrong; w.apply(.drop(3)); return w }(), turns: 1))
    }
}

final class ProgressionTests: XCTestCase {
    func summary(_ outcome: Outcome, difficulty: Difficulty = .master, human: Player = .sun, undo: Int = 0,
                 abilities: [Ability: Int] = [:], last: Move? = .drop(3), arena: String = "origin",
                 crystals: Int = 0, afterRift: Bool = false) -> MatchSummary {
        MatchSummary(mode: .versusAI, arenaID: arena, difficulty: difficulty, humanPlayer: human, outcome: outcome,
                     decisiveMove: last, humanAbilityUses: abilities, humanCrystals: crystals, humanTurns: 10,
                     undoCount: undo, finishedAfterRift: afterRift)
    }

    func testLevelCurve() {
        XCTAssertEqual(Profile.xpRequired(for: 1), 0)
        XCTAssertEqual(Profile.xpRequired(for: 2), 100)
        XCTAssertEqual(Profile.xpRequired(for: 3), 250)
        XCTAssertEqual(Profile.level(forXP: 0), 1)
        XCTAssertEqual(Profile.level(forXP: 99), 1)
        XCTAssertEqual(Profile.level(forXP: 100), 2)
        XCTAssertEqual(Profile.level(forXP: 260), 3)
        for level in 1..<20 { XCTAssertLessThan(Profile.xpRequired(for: level), Profile.xpRequired(for: level + 1)) }
    }

    func testWinGrantsXPStatsAndAchievements() {
        var p = Profile()
        let r = p.record(summary(.win(.sun), last: .geyser(2)))
        XCTAssertEqual(r.xpGained, 55)
        XCTAssertEqual(p.stats.record(for: .master).wins, 1)
        XCTAssertEqual(p.stats.currentStreak, 1)
        XCTAssertTrue(r.newAchievements.contains(.firstVictory))
        XCTAssertTrue(r.newAchievements.contains(.masterDefeated))
        XCTAssertTrue(r.newAchievements.contains(.geyserFinish))
        XCTAssertTrue(r.newAchievements.contains(.purist))
        // Achievements are only granted once.
        let again = p.record(summary(.win(.sun)))
        XCTAssertFalse(again.newAchievements.contains(.firstVictory))
    }

    func testLossAndDrawResetStreak() {
        var p = Profile()
        p.record(summary(.win(.sun)))
        p.record(summary(.win(.sun)))
        p.record(summary(.win(.moon)))
        XCTAssertEqual(p.stats.currentStreak, 0)
        XCTAssertEqual(p.stats.bestStreak, 2)
        XCTAssertEqual(p.stats.record(for: .master).losses, 1)
        p.record(summary(.draw))
        XCTAssertEqual(p.stats.record(for: .master).draws, 1)
    }

    func testStreakAchievement() {
        var p = Profile()
        for _ in 0..<3 { p.record(summary(.win(.sun), difficulty: .apprentice)) }
        XCTAssertTrue(p.has(.streakThree))
    }

    func testUndoHalvesXPAndBlocksAchievements() {
        var p = Profile()
        let r = p.record(summary(.win(.sun), undo: 2))
        XCTAssertEqual(r.xpGained, 27)
        XCTAssertTrue(r.newAchievements.isEmpty)
    }

    func testPuristRequiresAbilityArenaAndNoAbilities() {
        var p = Profile()
        p.record(summary(.win(.sun), arena: "classic"))
        XCTAssertFalse(p.has(.purist))
        p.record(summary(.win(.sun), abilities: [.anchor: 1]))
        XCTAssertFalse(p.has(.purist))
        p.record(summary(.win(.sun), difficulty: .apprentice))
        XCTAssertFalse(p.has(.purist))
    }

    func testRiftFinishAndCrystalAchievements() {
        var p = Profile()
        p.record(summary(.win(.sun), abilities: [.rift: 1], crystals: 3, afterRift: true))
        XCTAssertTrue(p.has(.riftFinish))
        XCTAssertTrue(p.has(.crystalHoarder))
    }

    func testLevelUpUnlocksArenasAndSkins() {
        var p = Profile()
        p.xp = Profile.xpRequired(for: 3) - 10
        XCTAssertFalse(p.isUnlocked(.monolith))
        let r = p.record(summary(.win(.sun), difficulty: .grandmaster))
        XCTAssertEqual(r.levelBefore, 2)
        XCTAssertEqual(r.levelAfter, 3)
        XCTAssertEqual(r.unlockedArenas.map(\.id), ["monolith"])
        XCTAssertTrue(p.isUnlocked(.monolith))
        XCTAssertTrue(p.has(.grandmasterDefeated))
    }

    func testUnratedModesGiveNothing() {
        var p = Profile()
        var s = summary(.win(.sun))
        s.mode = .training
        XCTAssertEqual(p.record(s), .none)
        XCTAssertEqual(p.xp, 0)
        s.mode = .versusAI
        s.outcome = .ongoing
        XCTAssertEqual(p.record(s), .none)
    }

    func testDuelStatistics() {
        var p = Profile()
        for i in 0..<5 {
            let s = MatchSummary(mode: .localDuel, arenaID: "origin", difficulty: nil, humanPlayer: nil,
                                 outcome: i == 4 ? .draw : .win(i % 2 == 0 ? .sun : .moon), decisiveMove: nil,
                                 humanAbilityUses: [:], humanCrystals: 0, humanTurns: 8, undoCount: 0)
            XCTAssertEqual(p.record(s).xpGained, 15)
        }
        XCTAssertEqual(p.stats.duelsPlayed, 5)
        XCTAssertEqual(p.stats.duelWinsSun, 2)
        XCTAssertEqual(p.stats.duelWinsMoon, 2)
        XCTAssertEqual(p.stats.duelDraws, 1)
        XCTAssertTrue(p.has(.duelist))
    }

    func testPuzzleRewardsOnlyOnce() {
        var p = Profile()
        XCTAssertEqual(p.recordPuzzleSolved("p01").xpGained, 30)
        XCTAssertEqual(p.recordPuzzleSolved("p01").xpGained, 0)
        XCTAssertTrue(p.has(.puzzleSolver))
        for puzzle in Puzzle.catalog { p.recordPuzzleSolved(puzzle.id) }
        XCTAssertTrue(p.has(.puzzleMaster))
    }

    func testSummaryFromMatch() throws {
        var m = try Match(config: MatchConfig(mode: .versusAI, arenaID: "classic", difficulty: .apprentice, aiPlayer: .moon))
        for c in [0, 6, 1, 6, 2, 6, 3] { try m.play(.drop(c)) }
        let s = MatchSummary(match: m)
        XCTAssertTrue(s.humanWon)
        XCTAssertEqual(s.humanPlayer, .sun)
        XCTAssertEqual(s.humanTurns, 4)
        XCTAssertEqual(s.decisiveMove, .drop(3))
    }

    func testProfileAndSettingsDecodeTolerantly() throws {
        let profile = try JSONDecoder().decode(Profile.self, from: Data("{\"xp\": 120}".utf8))
        XCTAssertEqual(profile.level, 2)
        XCTAssertTrue(profile.achievements.isEmpty)
        let settings = try JSONDecoder().decode(Settings.self, from: Data("{\"soundEnabled\": false, \"lastDifficulty\": \"godlike\"}".utf8))
        XCTAssertFalse(settings.soundEnabled)
        XCTAssertEqual(settings.lastDifficulty, .strategist)
        var full = Settings()
        full.tableMode = true
        let round = try JSONDecoder().decode(Settings.self, from: JSONEncoder().encode(full))
        XCTAssertEqual(round, full)
    }
}
