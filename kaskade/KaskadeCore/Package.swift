// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "KaskadeCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "KaskadeCore", targets: ["KaskadeCore"])
    ],
    targets: [
        .target(name: "KaskadeCore"),
        // Command-line self-play tool used for balancing and AI strength measurements.
        .executableTarget(name: "KaskadeSim", dependencies: ["KaskadeCore"]),
        .testTarget(name: "KaskadeCoreTests", dependencies: ["KaskadeCore"])
    ]
)
