import XCTest
@testable import KaskadeCore

final class AITests: XCTestCase {
    func testTakesImmediateWin() {
        let s = position([".......", ".......", ".......", ".......", "MMM....", "SSS...."], toMove: .sun, abilities: false)
        for d in Difficulty.allCases where d != .apprentice {
            var rng = SeededRandom(seed: 1)
            let move = SearchEngine().chooseMove(for: s, difficulty: d, rng: &rng)
            XCTAssertEqual(move, .drop(3), d.rawValue)
        }
    }

    func testBlocksImmediateLoss() {
        // Moon threatens (3,0); sun has nothing better.
        let s = position([".......", ".......", ".......", ".......", "S......", "MMM.S.."], toMove: .sun, abilities: false)
        for d in [Difficulty.strategist, .master, .grandmaster] {
            var rng = SeededRandom(seed: 2)
            XCTAssertEqual(SearchEngine().chooseMove(for: s, difficulty: d, rng: &rng), .drop(3), d.rawValue)
        }
    }

    func testUsesAbilityToWin() {
        for id in ["p03", "p04", "p05"] {
            let s = Puzzle.named(id)!.makeState()
            let result = SearchEngine().search(s, maxDepth: 3, timeLimit: 2)
            XCTAssertNotNil(result)
            XCTAssertNotEqual(result?.move.kind, .drop, "\(id) needs an ability")
            XCTAssertGreaterThan(result!.score, SearchEngine.winScore / 2, id)
        }
    }

    func testAlwaysReturnsLegalMoves() {
        var rng = SeededRandom(seed: 42)
        let engine = SearchEngine(tableBits: 14)
        for arena in Arena.catalog {
            var s = GameState(arena: arena)
            var guardCounter = 0
            while s.outcome == .ongoing && guardCounter < 200 {
                let d = Difficulty.allCases[guardCounter % 2]
                guard let m = engine.chooseMove(for: s, difficulty: d, rng: &rng) else {
                    return XCTFail("no move in running game")
                }
                XCTAssertNil(s.check(m), "\(arena.id): \(m) illegal")
                s.apply(m)
                guardCounter += 1
            }
            XCTAssertTrue(s.outcome.isOver, "\(arena.id) game should finish")
        }
    }

    func testRespectsTimeBudget() {
        let s = GameState(arena: .expanse)
        let clock = ContinuousClock()
        let start = clock.now
        let result = SearchEngine().search(s, maxDepth: 30, timeLimit: 0.5)
        let elapsed = clock.now - start
        XCTAssertNotNil(result)
        XCTAssertLessThan(elapsed, .milliseconds(1500))
        XCTAssertGreaterThanOrEqual(result!.depthReached, 3)
    }

    func testDeterministicWithSeed() {
        let s = GameState(arena: .origin)
        var r1 = SeededRandom(seed: 7), r2 = SeededRandom(seed: 7)
        let a = SearchEngine().chooseMove(for: s, difficulty: .apprentice, rng: &r1)
        let b = SearchEngine().chooseMove(for: s, difficulty: .apprentice, rng: &r2)
        XCTAssertEqual(a, b)
    }

    /// Higher levels must beat lower levels clearly (both sides alternate).
    func testStrengthOrdering() {
        func play(_ sunLevel: Difficulty, _ moonLevel: Difficulty, seed: UInt64) -> Outcome {
            var rng = SeededRandom(seed: seed)
            let engine = SearchEngine(tableBits: 16)
            var s = GameState(arena: .origin)
            var config: [Player: AIConfig] = [.sun: sunLevel.config, .moon: moonLevel.config]
            // Keep the test fast: cap the time budget.
            for p in Player.allCases { config[p]!.timeLimit = min(config[p]!.timeLimit, 0.15) }
            while s.outcome == .ongoing {
                let m = engine.chooseMove(for: s, config: config[s.toMove]!, rng: &rng)!
                s.apply(m)
            }
            return s.outcome
        }
        func score(strong: Difficulty, weak: Difficulty, games: Int) -> Double {
            var points = 0.0
            for g in 0..<games {
                let strongIsSun = g % 2 == 0
                let outcome = strongIsSun ? play(strong, weak, seed: UInt64(g)) : play(weak, strong, seed: UInt64(g))
                switch outcome {
                case .win(let p): if (p == .sun) == strongIsSun { points += 1 }
                case .draw: points += 0.5
                case .ongoing: break
                }
            }
            return points / Double(games)
        }
        XCTAssertGreaterThanOrEqual(score(strong: .strategist, weak: .apprentice, games: 10), 0.7)
        XCTAssertGreaterThanOrEqual(score(strong: .master, weak: .strategist, games: 8), 0.6)
    }
}
