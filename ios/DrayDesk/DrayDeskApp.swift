import SwiftUI
import SwiftData

@main
struct DrayDeskApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: Box.self)
    }
}

/// Folded (compact width): the split view collapses to a stack, Next Move card on top.
/// Unfolded on iPhone Duo (regular width, near-square): board on the left, detail pane on the right.
/// The selection lives in SceneStorage so folding or unfolding keeps the same container open.
struct RootView: View {
    @Environment(\.modelContext) private var context
    @Query(sort: \Box.createdAt, order: .reverse) private var boxes: [Box]
    @SceneStorage("selectedBoxID") private var selectedID: String = ""
    @SceneStorage("columnVisibility") private var showSidebar: Bool = true
    @AppStorage("boardFilter") private var filterRaw: String = "active"
    @AppStorage("seededSamples") private var seeded: Bool = false

    private var selection: Binding<UUID?> {
        Binding(
            get: { UUID(uuidString: selectedID) },
            set: { selectedID = $0?.uuidString ?? "" }
        )
    }

    private var columns: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { showSidebar ? .all : .detailOnly },
            set: { showSidebar = ($0 != .detailOnly) }
        )
    }

    var body: some View {
        NavigationSplitView(columnVisibility: columns) {
            BoardView(boxes: boxes, selection: selection, filterRaw: $filterRaw, onAdd: addBox)
                .navigationSplitViewColumnWidth(min: 300, ideal: 360, max: 440)
        } detail: {
            if let id = selection.wrappedValue, let box = boxes.first(where: { $0.id == id }) {
                DetailView(box: box, onDelete: { delete(box) })
                    .id(box.id)
            } else {
                ContentUnavailableView {
                    Label("Pick a container", systemImage: "shippingbox")
                } description: {
                    Text("Every box on the board shows its Last Free Day and return clock in dollars.")
                } actions: {
                    Button("Add container", action: addBox).buttonStyle(.borderedProminent)
                }
            }
        }
        .tint(.orange)
        .task {
            if !seeded && boxes.isEmpty {
                Box.samples().forEach { context.insert($0) }
            }
            seeded = true
        }
    }

    private func addBox() {
        let cal = Calendar.current
        let box = Box(lastFreeDay: cal.date(byAdding: .day, value: 2, to: .now),
                      returnBy: cal.date(byAdding: .day, value: 6, to: .now))
        context.insert(box)
        if filterRaw == "returned" { filterRaw = "active" }
        selectedID = box.id.uuidString
    }

    private func delete(_ box: Box) {
        if selectedID == box.id.uuidString { selectedID = "" }
        context.delete(box)
    }
}
