/// A playing field: board size, crystal layout, fixed obstacles and energy rules.
/// Arenas are pure data so new ones can be added without touching the rules engine.
public struct Arena: Identifiable, Hashable, Codable, Sendable {
    public let id: String
    public let name: String
    public let tagline: String
    public let columns: Int
    public let rows: Int
    public let crystals: [Cell]
    /// Neutral stones present at the start. Must rest on the floor or on other obstacles.
    public let obstacles: [Cell]
    public let abilitiesEnabled: Bool
    public let startEnergySun: Int
    public let startEnergyMoon: Int
    public let maxEnergy: Int
    public let unlockLevel: Int

    public init(id: String, name: String, tagline: String, columns: Int, rows: Int,
                crystals: [Cell], obstacles: [Cell] = [], abilitiesEnabled: Bool = true,
                startEnergySun: Int = 0, startEnergyMoon: Int = 1, maxEnergy: Int = 3,
                unlockLevel: Int = 1) {
        self.id = id
        self.name = name
        self.tagline = tagline
        self.columns = columns
        self.rows = rows
        self.crystals = crystals
        self.obstacles = obstacles
        self.abilitiesEnabled = abilitiesEnabled
        self.startEnergySun = startEnergySun
        self.startEnergyMoon = startEnergyMoon
        self.maxEnergy = maxEnergy
        self.unlockLevel = unlockLevel
    }

    public var geometry: Geometry { Geometry(columns: columns, rows: rows) }

    /// Validates the arena definition (used by tests and when loading saves).
    public func validate() -> Bool {
        guard columns >= 4, rows >= 4, columns * (rows + 1) <= Geometry.maxBits else { return false }
        let g = geometry
        let obstacleSet = Set(obstacles)
        for o in obstacles {
            guard g.contains(o) else { return false }
            if o.row > 0 && !obstacleSet.contains(Cell(o.column, o.row - 1)) { return false }
        }
        for c in crystals {
            guard g.contains(c), !obstacleSet.contains(c) else { return false }
        }
        guard Set(crystals).count == crystals.count, obstacleSet.count == obstacles.count else { return false }
        return startEnergySun >= 0 && startEnergyMoon >= 0
            && startEnergySun <= maxEnergy && startEnergyMoon <= maxEnergy
    }
}

public extension Arena {
    static let origin = Arena(
        id: "origin", name: "Ursprung",
        tagline: "Das Standardbrett. Vier Kristalle in der Mitte.",
        columns: 7, rows: 6,
        crystals: [Cell(1, 1), Cell(5, 1), Cell(2, 3), Cell(4, 3)])

    static let classic = Arena(
        id: "classic", name: "Klassik",
        tagline: "Ohne Kristalle und Fähigkeiten. Nur die reine Regel.",
        columns: 7, rows: 6, crystals: [], abilitiesEnabled: false,
        startEnergySun: 0, startEnergyMoon: 0)

    static let monolith = Arena(
        id: "monolith", name: "Monolith",
        tagline: "Drei uralte Steine blockieren den Boden.",
        columns: 7, rows: 6,
        crystals: [Cell(0, 2), Cell(6, 2), Cell(2, 2), Cell(4, 2)],
        obstacles: [Cell(0, 0), Cell(3, 0), Cell(6, 0), Cell(0, 1), Cell(6, 1)],
        unlockLevel: 3)

    static let expanse = Arena(
        id: "expanse", name: "Weite",
        tagline: "Größeres Brett, mehr Kristalle, längere Pläne.",
        columns: 8, rows: 7,
        crystals: [Cell(1, 1), Cell(6, 1), Cell(3, 2), Cell(4, 2), Cell(2, 4), Cell(5, 4)],
        startEnergySun: 1, startEnergyMoon: 2,
        unlockLevel: 5)

    static let grotto = Arena(
        id: "grotto", name: "Kristallgrotte",
        tagline: "Acht Kristalle. Energie im Überfluss, Chaos garantiert.",
        columns: 7, rows: 6,
        crystals: [Cell(0, 1), Cell(6, 1), Cell(2, 1), Cell(4, 1),
                   Cell(1, 3), Cell(5, 3), Cell(3, 2), Cell(3, 4)],
        unlockLevel: 7)

    static let catalog: [Arena] = [.origin, .classic, .monolith, .expanse, .grotto]

    static func named(_ id: String) -> Arena? { catalog.first { $0.id == id } }
}
