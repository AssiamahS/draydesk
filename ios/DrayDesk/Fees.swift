import Foundation

/// A deadline on a container that turns into dollars when it passes.
struct FeeClock: Identifiable {
    enum Kind: String { case demurrage, perDiem }
    let kind: Kind
    let due: Date
    let secondsLeft: TimeInterval
    /// What the next day late costs.
    let rate: Double
    /// Owed so far.
    let accrued: Double
    var id: String { kind.rawValue }
    var isLate: Bool { secondsLeft < 0 }
    var title: String { kind == .demurrage ? "Last Free Day" : "Empty return" }
}

struct Assessment {
    enum Level { case ok, warn, hot, done }
    let level: Level
    let score: Double
    let clocks: [FeeClock]
    var primary: FeeClock? { clocks.min { $0.secondsLeft < $1.secondsLeft } }
    var accrued: Double { clocks.reduce(0) { $0 + $1.accrued } }
    var bleedingPerDay: Double { clocks.filter(\.isLate).reduce(0) { $0 + $1.rate } }
}

enum Fees {
    static let day: TimeInterval = 86_400

    static func endOfDay(_ date: Date, calendar: Calendar = .current) -> Date {
        let start = calendar.startOfDay(for: date)
        return start.addingTimeInterval(day - 1)
    }

    static func clocks(for box: Box, now: Date = .now) -> [FeeClock] {
        var result: [FeeClock] = []
        if box.status == .terminal, let lfd = box.lastFreeDay {
            let due = endOfDay(lfd)
            let left = due.timeIntervalSince(now)
            var accrued = 0.0
            var rate = box.demurrageRate
            if left < 0 {
                let late = Int(ceil(-left / day))
                let step = max(0, box.demurrageStepDays)
                let tier1 = step > 0 ? min(late, step) : late
                accrued = Double(tier1) * box.demurrageRate + Double(max(0, late - tier1)) * box.demurrageRate2
                rate = (step > 0 && late >= step) ? box.demurrageRate2 : box.demurrageRate
            }
            result.append(FeeClock(kind: .demurrage, due: due, secondsLeft: left, rate: rate, accrued: accrued))
        }
        if box.status == .out || box.status == .empty, let ret = box.returnBy {
            let due = endOfDay(ret)
            let left = due.timeIntervalSince(now)
            let accrued = left < 0 ? Double(Int(ceil(-left / day))) * box.perDiemRate : 0
            result.append(FeeClock(kind: .perDiem, due: due, secondsLeft: left, rate: box.perDiemRate, accrued: accrued))
        }
        return result
    }

    /// Rank by dollars per hour until the next charge lands, so a box about to go late
    /// outranks one that is already late but cheaper.
    static func assess(_ box: Box, now: Date = .now) -> Assessment {
        let cl = clocks(for: box, now: now)
        if box.status == .returned { return Assessment(level: .done, score: -1, clocks: cl) }
        guard let primary = cl.min(by: { $0.secondsLeft < $1.secondsLeft }) else {
            return Assessment(level: .warn, score: 0.5, clocks: cl)
        }
        let hours = primary.secondsLeft / 3600
        let level: Assessment.Level = hours < 24 ? .hot : hours < 72 ? .warn : .ok
        var score = cl.map { clock -> Double in
            let next = clock.secondsLeft >= 0 ? clock.secondsLeft : day - (-clock.secondsLeft).truncatingRemainder(dividingBy: day)
            return clock.rate / max(next / 3600, 1) + (clock.isLate ? 1 : 0)
        }.max() ?? 0
        if let appt = box.appointment {
            let a = appt.timeIntervalSince(now)
            if a > -7200 && a < 6 * 3600 { score += 50 }
        }
        return Assessment(level: level, score: score, clocks: cl)
    }

    static func nextAction(_ box: Box) -> String {
        let where_ = box.terminal.isEmpty ? "the terminal" : box.terminal
        switch box.status {
        case .terminal:
            let appt = box.appointment.map { " Appointment \($0.formatted(date: .abbreviated, time: .shortened))." } ?? " No appointment booked yet."
            return "Pull from \(where_) before Last Free Day.\(appt)"
        case .out:
            return "Deliver to \(box.customer.isEmpty ? "the customer" : box.customer), get it unloaded, then return the empty."
        case .empty:
            return "Return empty to \(box.returnTo.isEmpty ? where_ : box.returnTo)\(box.line.isEmpty ? "" : " (\(box.line))")."
        case .returned:
            return "Done."
        }
    }

    static func money(_ v: Double) -> String {
        v.formatted(.currency(code: "USD").precision(.fractionLength(0)))
    }

    static func duration(_ seconds: TimeInterval) -> String {
        let s = abs(seconds)
        if s < 3600 { return "\(max(1, Int((s / 60).rounded())))m" }
        if s < 2 * day { return "\(Int((s / 3600).rounded()))h" }
        let d = Int(s / day)
        let h = Int((s.truncatingRemainder(dividingBy: day) / 3600).rounded())
        return h > 0 ? "\(d)d \(h)h" : "\(d)d"
    }
}

/// ISO 6346 container number check (4 letters + 7 digits, last digit is a check digit).
enum ContainerNumber {
    private static let letterValues: [Character: Int] = {
        var map: [Character: Int] = [:]
        var v = 10
        for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ" {
            if v % 11 == 0 { v += 1 }
            map[ch] = v
            v += 1
        }
        return map
    }()

    static func normalize(_ raw: String) -> String {
        String(raw.uppercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(11))
    }

    /// nil = valid, otherwise a short message.
    static func problem(_ raw: String) -> String? {
        let cn = Array(normalize(raw))
        guard cn.count == 11,
              cn[0..<4].allSatisfy({ $0.isLetter }),
              cn[4..<11].allSatisfy({ $0.isNumber }) else {
            return "Format is 4 letters + 7 digits"
        }
        var sum = 0
        for i in 0..<10 {
            let value = i < 4 ? (letterValues[cn[i]] ?? 0) : Int(String(cn[i])) ?? 0
            sum += value << i
        }
        let expect = (sum % 11) % 10
        return expect == Int(String(cn[10])) ? nil : "Check digit should be \(expect)"
    }
}
