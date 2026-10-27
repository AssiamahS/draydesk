import Foundation
import SwiftData

enum BoxStatus: String, CaseIterable, Identifiable {
    case terminal, out, empty, returned
    var id: String { rawValue }
    var title: String {
        switch self {
        case .terminal: "At terminal"
        case .out: "Out loaded"
        case .empty: "Empty, ready to return"
        case .returned: "Returned"
        }
    }
}

/// One container on the board. Stored on-device with SwiftData only.
@Model
final class Box {
    var id: UUID = UUID()
    var number: String = ""
    var line: String = ""
    var terminal: String = ""
    var statusRaw: String = BoxStatus.terminal.rawValue
    var lastFreeDay: Date?
    var demurrageRate: Double = 200
    var demurrageRate2: Double = 400
    var demurrageStepDays: Int = 4
    var appointment: Date?
    var returnBy: Date?
    var perDiemRate: Double = 150
    var returnTo: String = ""
    var customer: String = ""
    var notes: String = ""
    var createdAt: Date = Date()

    init(number: String = "", line: String = "", terminal: String = "", status: BoxStatus = .terminal,
         lastFreeDay: Date? = nil, demurrageRate: Double = 200, demurrageRate2: Double = 400, demurrageStepDays: Int = 4,
         appointment: Date? = nil, returnBy: Date? = nil, perDiemRate: Double = 150,
         returnTo: String = "", customer: String = "", notes: String = "") {
        self.number = number
        self.line = line
        self.terminal = terminal
        self.statusRaw = status.rawValue
        self.lastFreeDay = lastFreeDay
        self.demurrageRate = demurrageRate
        self.demurrageRate2 = demurrageRate2
        self.demurrageStepDays = demurrageStepDays
        self.appointment = appointment
        self.returnBy = returnBy
        self.perDiemRate = perDiemRate
        self.returnTo = returnTo
        self.customer = customer
        self.notes = notes
    }

    var status: BoxStatus {
        get { BoxStatus(rawValue: statusRaw) ?? .terminal }
        set { statusRaw = newValue.rawValue }
    }
}

extension Box {
    static func samples(now: Date = .now) -> [Box] {
        let cal = Calendar.current
        func day(_ n: Int) -> Date { cal.date(byAdding: .day, value: n, to: now) ?? now }
        return [
            Box(number: "MSCU1234566", line: "MSC", terminal: "APM Elizabeth", status: .terminal,
                lastFreeDay: day(0), demurrageRate: 225, demurrageRate2: 400,
                appointment: now.addingTimeInterval(3 * 3600), returnBy: day(5), perDiemRate: 175,
                returnTo: "APM Elizabeth", customer: "Edison DC", notes: "Hot box. Customer wants it by 2pm."),
            Box(number: "MAEU7654320", line: "Maersk", terminal: "Maher", status: .terminal,
                lastFreeDay: day(2), demurrageRate: 175, demurrageRate2: 350, returnBy: day(7),
                returnTo: "Maher", customer: "Carteret warehouse"),
            Box(number: "CMAU3141590", line: "CMA CGM", terminal: "PNCT", status: .empty,
                lastFreeDay: day(-3), returnBy: day(-1), perDiemRate: 165,
                returnTo: "PNCT", customer: "Secaucus 3PL", notes: "Empty has been sitting at the customer."),
            Box(number: "HLXU2718283", line: "Hapag-Lloyd", terminal: "GCT Bayonne", status: .out,
                lastFreeDay: day(-1), returnBy: day(4), returnTo: "GCT Bayonne", customer: "Linden cold storage"),
        ]
    }
}
