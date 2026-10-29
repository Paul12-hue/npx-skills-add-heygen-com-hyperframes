import Foundation
import KaskadeCore

// Usage: KaskadeSim [games] [arenaID] [timeLimit] [sunLevel] [moonLevel]
let args = CommandLine.arguments
let games = args.count > 1 ? Int(args[1]) ?? 20 : 20
let baseArena = args.count > 2 ? Arena.named(args[2]) ?? .origin : .origin
let env = ProcessInfo.processInfo.environment
let arena = Arena(id: baseArena.id, name: baseArena.name, tagline: "", columns: baseArena.columns, rows: baseArena.rows,
                  crystals: baseArena.crystals, obstacles: baseArena.obstacles, abilitiesEnabled: baseArena.abilitiesEnabled,
                  startEnergySun: env["SUN_E"].flatMap(Int.init) ?? baseArena.startEnergySun,
                  startEnergyMoon: env["MOON_E"].flatMap(Int.init) ?? baseArena.startEnergyMoon,
                  maxEnergy: baseArena.maxEnergy)
let timeLimit = args.count > 3 ? Double(args[3]) ?? 0.2 : 0.2
let sunLevel = args.count > 4 ? Difficulty(rawValue: args[4]) ?? .master : .master
let moonLevel = args.count > 5 ? Difficulty(rawValue: args[5]) ?? .master : .master

var sunWins = 0, moonWins = 0, draws = 0
var abilityCounts: [Ability: Int] = [:]
var crystals = 0
var totalTurns = 0
var maxThink = 0.0
var depthSum = 0, searches = 0
let engine = SearchEngine()
let clock = ContinuousClock()

for g in 0..<games {
    var rng = SeededRandom(seed: UInt64(g + (Int(env["SEED"] ?? "0") ?? 0)) &* 7919)
    var s = GameState(arena: arena)
    // Vary openings: two random drops so self-play games differ.
    for _ in 0..<2 {
        let drops = s.legalMoves.filter { $0.kind == .drop }
        s.apply(drops.randomElement(using: &rng)!)
    }
    while s.outcome == .ongoing {
        var config = (s.toMove == .sun ? sunLevel : moonLevel).config
        config.timeLimit = min(config.timeLimit, timeLimit)
        let start = clock.now
        let move = engine.chooseMove(for: s, config: config, rng: &rng)!
        let elapsed = clock.now - start
        maxThink = max(maxThink, Double(elapsed.components.attoseconds) / 1e18 + Double(elapsed.components.seconds))
        if let a = move.ability { abilityCounts[a, default: 0] += 1 }
        if !s.awaitingFollowUpDrop { totalTurns += 1 }
        let fx = s.apply(move)
        crystals += fx.crystalsClaimed.filter { $0.by != nil }.count
    }
    switch s.outcome {
    case .win(.sun): sunWins += 1
    case .win(.moon): moonWins += 1
    default: draws += 1
    }
}
_ = depthSum; _ = searches

let n = Double(games)
print("arena=\(arena.id) games=\(games) sun=\(sunLevel.rawValue) moon=\(moonLevel.rawValue) time=\(timeLimit)s")
print(String(format: "sun %.0f%%  moon %.0f%%  draw %.0f%%", Double(sunWins) / n * 100, Double(moonWins) / n * 100, Double(draws) / n * 100))
print(String(format: "turns/game %.1f  crystals/game %.2f  maxThink %.2fs", Double(totalTurns) / n, Double(crystals) / n, maxThink))
for a in Ability.allCases { print(String(format: "  %@/game %.2f", a.rawValue, Double(abilityCounts[a] ?? 0) / n)) }
