import Foundation
import HealthKit
import React

@objc(HealthKitSyncModule)
class HealthKitSyncModule: NSObject {
  private let healthStore = HKHealthStore()
  private var observerQueries: [HKObserverQuery] = []
  private let anchorKeyPrefix = "healthkit.anchor."
  private let backgroundDeliveryDefaultsKey = "healthkit.backgroundDeliveryEnabled"
  private let observerEventTimestampsDefaultsKey = "healthkit.observerEventTimestamps"
  private let pendingObserverTypesDefaultsKey = "healthkit.pendingObserverTypes"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func isAvailable(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    resolve(HKHealthStore.isHealthDataAvailable())
  }

  @objc
  func getStatus(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if UserDefaults.standard.bool(forKey: backgroundDeliveryDefaultsKey) {
      registerObserverQueries()
    }
    resolve(buildStatus())
  }

  @objc
  func requestAuthorization(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve(buildStatus())
      return
    }

    healthStore.requestAuthorization(toShare: [], read: readTypes()) { _, error in
      if let error = error {
        reject("healthkit_authorization_failed", error.localizedDescription, error)
        return
      }

      if UserDefaults.standard.bool(forKey: self.backgroundDeliveryDefaultsKey) {
        self.registerObserverQueries()
      }
      resolve(self.buildStatus())
    }
  }

  @objc
  func enableBackgroundDelivery(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve(buildStatus())
      return
    }

    let group = DispatchGroup()
    var firstError: Error?

    for sampleType in backgroundDeliveryTypes() {
      group.enter()
      healthStore.enableBackgroundDelivery(
        for: sampleType,
        frequency: .immediate
      ) { _, error in
        if firstError == nil {
          firstError = error
        }
        group.leave()
      }
    }

    group.notify(queue: .main) {
      if let error = firstError {
        reject("healthkit_background_delivery_failed", error.localizedDescription, error)
        return
      }

      UserDefaults.standard.set(true, forKey: self.backgroundDeliveryDefaultsKey)
      self.registerObserverQueries()
      resolve(self.buildStatus())
    }
  }

  @objc
  func triggerSyncNow(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    markPendingObserverTypes(observedTypeKeys())
    resolve(buildStatus())
  }

  @objc
  func consumePendingObserverTypes(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let pendingTypes = pendingObserverTypes()
    UserDefaults.standard.removeObject(forKey: pendingObserverTypesDefaultsKey)
    resolve(pendingTypes)
  }

  @objc
  func readStepSummaryForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve(NSNull())
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    let interval = dayInterval(for: date)
    let predicate = HKQuery.predicateForSamples(
      withStart: interval.start,
      end: interval.end,
      options: .strictStartDate
    )

    let group = DispatchGroup()
    var steps: Double?
    var distance: Double?
    var calories: Double?
    var firstError: Error?

    if let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) {
      group.enter()
      statisticsSum(
        quantityType: stepType,
        unit: HKUnit.count(),
        predicate: predicate
      ) { value, error in
        steps = value
        if firstError == nil { firstError = error }
        group.leave()
      }
    }

    if let distanceType = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) {
      group.enter()
      statisticsSum(
        quantityType: distanceType,
        unit: HKUnit.meter(),
        predicate: predicate
      ) { value, error in
        distance = value
        group.leave()
      }
    }

    if let energyType = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
      group.enter()
      statisticsSum(
        quantityType: energyType,
        unit: HKUnit.kilocalorie(),
        predicate: predicate
      ) { value, error in
        calories = value
        group.leave()
      }
    }

    group.notify(queue: .main) {
      if let error = firstError {
        reject("healthkit_step_summary_failed", error.localizedDescription, error)
        return
      }

      let result: [String: Any] = [
        "averageSpeedKph": NSNull(),
        "caloriesKcal": calories as Any,
        "distanceMeters": distance as Any,
        "selectedDataOrigin": "apple.healthkit",
        "steps": steps as Any,
      ]

      resolve(result)
    }
  }

  @objc
  func readHeartRateEntriesForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      resolve([])
      return
    }

    let interval = dayInterval(for: date)
    let predicate = HKQuery.predicateForSamples(
      withStart: interval.start,
      end: interval.end,
      options: .strictStartDate
    )

    let sortDescriptors = [
      NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
    ]

    let query = HKSampleQuery(
      sampleType: heartRateType,
      predicate: predicate,
      limit: HKObjectQueryNoLimit,
      sortDescriptors: sortDescriptors
    ) { _, samples, error in
      if let error = error {
        reject("healthkit_heart_rate_read_failed", error.localizedDescription, error)
        return
      }

      let entries = (samples as? [HKQuantitySample] ?? []).map { sample in
        [
          "measuredAt": self.iso8601String(from: sample.startDate),
          "value": sample.quantity.doubleValue(
            for: HKUnit.count().unitDivided(by: HKUnit.minute())
          ),
          "value2": NSNull(),
        ]
      }

      resolve(entries)
    }

    healthStore.execute(query)
  }

  @objc
  func readBloodPressureEntriesForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    guard let bloodPressureType = HKObjectType.correlationType(forIdentifier: .bloodPressure) else {
      resolve([])
      return
    }

    let query = HKSampleQuery(
      sampleType: bloodPressureType,
      predicate: dayPredicate(for: date),
      limit: HKObjectQueryNoLimit,
      sortDescriptors: [
        NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
      ]
    ) { _, samples, error in
      if let error = error {
        reject("healthkit_blood_pressure_read_failed", error.localizedDescription, error)
        return
      }

      resolve(self.serializeBloodPressureEntries(samples as? [HKCorrelation] ?? []))
    }

    healthStore.execute(query)
  }

  @objc
  func readSleepEntriesForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      resolve([])
      return
    }

    let query = HKSampleQuery(
      sampleType: sleepType,
      predicate: dayPredicate(for: date),
      limit: HKObjectQueryNoLimit,
      sortDescriptors: [
        NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
      ]
    ) { _, samples, error in
      if let error = error {
        reject("healthkit_sleep_read_failed", error.localizedDescription, error)
        return
      }

      resolve(self.serializeSleepEntries(samples as? [HKCategorySample] ?? []))
    }

    healthStore.execute(query)
  }

  @objc
  func readExerciseEntriesForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    let query = HKSampleQuery(
      sampleType: HKObjectType.workoutType(),
      predicate: dayPredicate(for: date),
      limit: HKObjectQueryNoLimit,
      sortDescriptors: [
        NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true),
      ]
    ) { _, samples, error in
      if let error = error {
        reject("healthkit_exercise_read_failed", error.localizedDescription, error)
        return
      }

      resolve(self.serializeExerciseEntries(samples as? [HKWorkout] ?? []))
    }

    healthStore.execute(query)
  }

  @objc
  func readHourlyStepCountsForDate(
    _ isoDate: NSString,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve(Array(repeating: 0, count: 24))
      return
    }

    guard let date = iso8601Date(from: isoDate as String) else {
      reject("healthkit_invalid_date", "Invalid ISO date supplied", nil)
      return
    }

    guard let stepType = HKObjectType.quantityType(forIdentifier: .stepCount) else {
      resolve(Array(repeating: 0, count: 24))
      return
    }

    let interval = dayInterval(for: date)
    var calendar = Calendar.current
    calendar.timeZone = TimeZone.current

    let components = DateComponents(hour: 1)
    let query = HKStatisticsCollectionQuery(
      quantityType: stepType,
      quantitySamplePredicate: HKQuery.predicateForSamples(
        withStart: interval.start,
        end: interval.end,
        options: .strictStartDate
      ),
      options: .cumulativeSum,
      anchorDate: interval.start,
      intervalComponents: components
    )

    query.initialResultsHandler = { _, results, error in
      if let error = error {
        reject("healthkit_hourly_steps_failed", error.localizedDescription, error)
        return
      }

      var hourlyCounts = Array(repeating: 0, count: 24)
      results?.enumerateStatistics(from: interval.start, to: interval.end) { statistics, _ in
        let hour = calendar.component(.hour, from: statistics.startDate)
        let count = statistics.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
        if hour >= 0 && hour < hourlyCounts.count {
          hourlyCounts[hour] = max(0, Int(round(count)))
        }
      }

      resolve(hourlyCounts)
    }

    healthStore.execute(query)
  }

  @objc
  func readAnchoredHeartRateChanges(
    _ startIsoDate: NSString?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let heartRateType = HKObjectType.quantityType(forIdentifier: .heartRate) else {
      resolve([])
      return
    }

    let startDate = startIsoDate.flatMap { iso8601Date(from: $0 as String) }
    let predicate = startDate.map {
      HKQuery.predicateForSamples(
        withStart: $0,
        end: nil,
        options: .strictStartDate
      )
    }

    let anchor = loadAnchor(for: "heart_rate")
    let query = HKAnchoredObjectQuery(
      type: heartRateType,
      predicate: predicate,
      anchor: anchor,
      limit: HKObjectQueryNoLimit
    ) { _, samples, _, newAnchor, error in
      if let error = error {
        reject("healthkit_anchored_heart_rate_failed", error.localizedDescription, error)
        return
      }

      if let newAnchor = newAnchor {
        self.saveAnchor(newAnchor, for: "heart_rate")
      }

      let entries = (samples as? [HKQuantitySample] ?? []).map { sample in
        [
          "externalRecordId": "healthkit:apple.healthkit:heart_rate:\(sample.uuid.uuidString)",
          "measuredAt": self.iso8601String(from: sample.startDate),
          "value": sample.quantity.doubleValue(
            for: HKUnit.count().unitDivided(by: HKUnit.minute())
          ),
          "value2": NSNull(),
        ]
      }

      resolve(entries)
    }

    healthStore.execute(query)
  }

  @objc
  func readAnchoredBloodPressureChanges(
    _ startIsoDate: NSString?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let bloodPressureType = HKObjectType.correlationType(forIdentifier: .bloodPressure) else {
      resolve([])
      return
    }

    let startDate = startIsoDate.flatMap { iso8601Date(from: $0 as String) }
    let predicate = startDate.map {
      HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate)
    }

    let query = HKAnchoredObjectQuery(
      type: bloodPressureType,
      predicate: predicate,
      anchor: loadAnchor(for: "blood_pressure"),
      limit: HKObjectQueryNoLimit
    ) { _, samples, _, newAnchor, error in
      if let error = error {
        reject("healthkit_anchored_blood_pressure_failed", error.localizedDescription, error)
        return
      }

      if let newAnchor = newAnchor {
        self.saveAnchor(newAnchor, for: "blood_pressure")
      }

      let systolicType = HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic)
      let diastolicType = HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)

      let entries = self.serializeBloodPressureEntries(
        samples as? [HKCorrelation] ?? [],
        systolicType: systolicType,
        diastolicType: diastolicType
      )

      resolve(entries)
    }

    healthStore.execute(query)
  }

  @objc
  func readAnchoredSleepChanges(
    _ startIsoDate: NSString?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
      resolve([])
      return
    }

    let startDate = startIsoDate.flatMap { iso8601Date(from: $0 as String) }
    let predicate = startDate.map {
      HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate)
    }

    let query = HKAnchoredObjectQuery(
      type: sleepType,
      predicate: predicate,
      anchor: loadAnchor(for: "sleep"),
      limit: HKObjectQueryNoLimit
    ) { _, samples, _, newAnchor, error in
      if let error = error {
        reject("healthkit_anchored_sleep_failed", error.localizedDescription, error)
        return
      }

      if let newAnchor = newAnchor {
        self.saveAnchor(newAnchor, for: "sleep")
      }

      resolve(self.serializeSleepEntries(samples as? [HKCategorySample] ?? []))
    }

    healthStore.execute(query)
  }

  @objc
  func readAnchoredExerciseChanges(
    _ startIsoDate: NSString?,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard HKHealthStore.isHealthDataAvailable() else {
      resolve([])
      return
    }

    let workoutType = HKObjectType.workoutType()
    let startDate = startIsoDate.flatMap { iso8601Date(from: $0 as String) }
    let predicate = startDate.map {
      HKQuery.predicateForSamples(withStart: $0, end: nil, options: .strictStartDate)
    }

    let query = HKAnchoredObjectQuery(
      type: workoutType,
      predicate: predicate,
      anchor: loadAnchor(for: "exercise"),
      limit: HKObjectQueryNoLimit
    ) { _, samples, _, newAnchor, error in
      if let error = error {
        reject("healthkit_anchored_exercise_failed", error.localizedDescription, error)
        return
      }

      if let newAnchor = newAnchor {
        self.saveAnchor(newAnchor, for: "exercise")
      }

      resolve(self.serializeExerciseEntries(samples as? [HKWorkout] ?? []))
    }

    healthStore.execute(query)
  }

  private func buildStatus() -> [String: Any] {
    let available = HKHealthStore.isHealthDataAvailable()
    let readAuthorization = authorizationSummary()

    return [
      "available": available,
      "backgroundDeliveryEnabled": UserDefaults.standard.bool(
        forKey: backgroundDeliveryDefaultsKey
      ),
      "lastObserverEventAtByType": observerEventTimestamps(),
      "pendingObserverTypes": pendingObserverTypes(),
      "provider": "healthkit",
      "readAuthorization": readAuthorization,
      "strategy": "healthkit-observer-query-native",
    ]
  }

  private func authorizationSummary() -> [String: String] {
    var statuses: [String: String] = [:]

    for (key, sampleType) in trackedReadTypes() {
      let status = healthStore.authorizationStatus(for: sampleType)
      switch status {
      case .notDetermined:
        statuses[key] = "not_determined"
      case .sharingDenied:
        statuses[key] = "denied"
      case .sharingAuthorized:
        statuses[key] = "authorized"
      @unknown default:
        statuses[key] = "unknown"
      }
    }

    return statuses
  }

  private func trackedReadTypes() -> [String: HKObjectType] {
    var types: [String: HKObjectType] = [:]

    if let stepCount = HKObjectType.quantityType(forIdentifier: .stepCount) {
      types["steps"] = stepCount
    }
    if let heartRate = HKObjectType.quantityType(forIdentifier: .heartRate) {
      types["heart_rate"] = heartRate
    }
    if let bloodPressureSystolic = HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic) {
      types["blood_pressure_systolic"] = bloodPressureSystolic
    }
    if let bloodPressureDiastolic = HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic) {
      types["blood_pressure_diastolic"] = bloodPressureDiastolic
    }
    if let sleepAnalysis = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
      types["sleep"] = sleepAnalysis
    }
    if let workout = HKObjectType.workoutType() as HKObjectType? {
      types["exercise"] = workout
    }
    if let distanceWalkingRunning = HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning) {
      types["distance_walking_running"] = distanceWalkingRunning
    }
    if let activeEnergyBurned = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) {
      types["active_energy_burned"] = activeEnergyBurned
    }

    return types
  }

  private func readTypes() -> Set<HKObjectType> {
    return Set(trackedReadTypes().values)
  }

  private func backgroundDeliveryTypes() -> [HKObjectType] {
    return Array(readTypes())
  }

  private func observedTypeKeys() -> [String] {
    return ["blood_pressure", "exercise", "heart_rate", "sleep", "steps"]
  }

  private func observerSampleType(for key: String) -> HKSampleType? {
    switch key {
    case "steps":
      return HKObjectType.quantityType(forIdentifier: .stepCount)
    case "heart_rate":
      return HKObjectType.quantityType(forIdentifier: .heartRate)
    case "blood_pressure":
      return HKObjectType.correlationType(forIdentifier: .bloodPressure)
    case "sleep":
      return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
    case "exercise":
      return HKObjectType.workoutType()
    default:
      return nil
    }
  }

  private func registerObserverQueries() {
    observerQueries.forEach { healthStore.stop($0) }
    observerQueries.removeAll()

    for key in observedTypeKeys() {
      guard let sampleType = observerSampleType(for: key) else {
        continue
      }

      let query = HKObserverQuery(sampleType: sampleType, predicate: nil) {
        [weak self] _, completionHandler, error in
        defer { completionHandler() }
        guard let self = self else { return }
        if error != nil {
          return
        }

        self.markObserverEvent(for: key)
      }
      observerQueries.append(query)
      healthStore.execute(query)
    }
  }

  private func observerEventTimestamps() -> [String: String] {
    return UserDefaults.standard.dictionary(forKey: observerEventTimestampsDefaultsKey) as? [String: String] ?? [:]
  }

  private func pendingObserverTypes() -> [String] {
    return UserDefaults.standard.array(forKey: pendingObserverTypesDefaultsKey) as? [String] ?? []
  }

  private func markObserverEvent(for key: String) {
    var timestamps = observerEventTimestamps()
    timestamps[key] = iso8601String(from: Date())
    UserDefaults.standard.set(timestamps, forKey: observerEventTimestampsDefaultsKey)
    markPendingObserverTypes([key])
  }

  private func markPendingObserverTypes(_ keys: [String]) {
    let merged = Set(pendingObserverTypes()).union(keys)
    UserDefaults.standard.set(Array(merged).sorted(), forKey: pendingObserverTypesDefaultsKey)
  }

  private func saveAnchor(_ anchor: HKQueryAnchor, for key: String) {
    do {
      let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
      UserDefaults.standard.set(data, forKey: "\(anchorKeyPrefix)\(key)")
    } catch {
      // Ignore anchor persistence failures. Sync can recover from server state.
    }
  }

  private func loadAnchor(for key: String) -> HKQueryAnchor? {
    guard let data = UserDefaults.standard.data(forKey: "\(anchorKeyPrefix)\(key)") else {
      return nil
    }

    return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
  }

  private func isAsleepCategory(_ value: Int) -> Bool {
    if value == HKCategoryValueSleepAnalysis.asleep.rawValue {
      return true
    }

    if #available(iOS 16.0, *) {
      return value == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
        value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
        value == HKCategoryValueSleepAnalysis.asleepREM.rawValue ||
        value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
    }

    return false
  }

  private func workoutTitle(for activityType: HKWorkoutActivityType) -> String {
    switch activityType {
    case .walking:
      return "Walking"
    case .running:
      return "Running"
    case .cycling:
      return "Cycling"
    case .hiking:
      return "Hiking"
    case .swimming:
      return "Swimming"
    case .traditionalStrengthTraining:
      return "Strength Training"
    case .functionalStrengthTraining:
      return "Functional Strength Training"
    case .yoga:
      return "Yoga"
    default:
      return "Imported workout"
    }
  }

  private func iso8601Date(from value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let date = formatter.date(from: value) {
      return date
    }

    formatter.formatOptions = [.withInternetDateTime]
    return formatter.date(from: value)
  }

  private func iso8601String(from date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  private func dayInterval(for date: Date) -> (start: Date, end: Date) {
    let calendar = Calendar.current
    let start = calendar.startOfDay(for: date)
    let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start
    return (start, end)
  }

  private func dayPredicate(for date: Date) -> NSPredicate {
    let interval = dayInterval(for: date)
    return HKQuery.predicateForSamples(
      withStart: interval.start,
      end: interval.end,
      options: .strictStartDate
    )
  }

  private func statisticsSum(
    quantityType: HKQuantityType,
    unit: HKUnit,
    predicate: NSPredicate,
    completion: @escaping (Double?, Error?) -> Void
  ) {
    let query = HKStatisticsQuery(
      quantityType: quantityType,
      quantitySamplePredicate: predicate,
      options: .cumulativeSum
    ) { _, result, error in
      let value = result?.sumQuantity()?.doubleValue(for: unit)
      completion(value, error)
    }

    healthStore.execute(query)
  }

  private func serializeBloodPressureEntries(
    _ samples: [HKCorrelation],
    systolicType: HKQuantityType? = HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic),
    diastolicType: HKQuantityType? = HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)
  ) -> [[String: Any]] {
    return samples.compactMap { correlation -> [String: Any]? in
      guard
        let systolicType = systolicType,
        let diastolicType = diastolicType,
        let systolicSample = correlation.objects(for: systolicType).first as? HKQuantitySample,
        let diastolicSample = correlation.objects(for: diastolicType).first as? HKQuantitySample
      else {
        return nil
      }

      return [
        "diastolicMmHg": diastolicSample.quantity.doubleValue(for: HKUnit.millimeterOfMercury()),
        "externalRecordId": "healthkit:apple.healthkit:blood_pressure:\(correlation.uuid.uuidString)",
        "measuredAt": iso8601String(from: correlation.endDate),
        "systolicMmHg": systolicSample.quantity.doubleValue(for: HKUnit.millimeterOfMercury()),
      ]
    }
  }

  private func serializeSleepEntries(_ samples: [HKCategorySample]) -> [[String: Any]] {
    return samples.compactMap { sample -> [String: Any]? in
      guard isAsleepCategory(sample.value) else {
        return nil
      }

      let durationMinutes = max(
        0,
        Int(round(sample.endDate.timeIntervalSince(sample.startDate) / 60.0))
      )
      if durationMinutes <= 0 {
        return nil
      }

      return [
        "durationMin": durationMinutes,
        "externalRecordId": "healthkit:apple.healthkit:sleep:\(sample.uuid.uuidString)",
        "measuredAt": iso8601String(from: sample.endDate),
        "sleepFromAt": iso8601String(from: sample.startDate),
        "sleepToAt": iso8601String(from: sample.endDate),
      ]
    }
  }

  private func serializeExerciseEntries(_ samples: [HKWorkout]) -> [[String: Any]] {
    return samples.compactMap { workout -> [String: Any]? in
      let durationMinutes = max(0, Int(round(workout.duration / 60.0)))
      if durationMinutes <= 0 {
        return nil
      }

      return [
        "caloriesKcal": workout.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie()) as Any,
        "durationMin": durationMinutes,
        "exerciseId": "healthkit_workout_\(workout.workoutActivityType.rawValue)",
        "exerciseTitle": workoutTitle(for: workout.workoutActivityType),
        "externalRecordId": "healthkit:apple.healthkit:exercise:\(workout.uuid.uuidString)",
        "measuredAt": iso8601String(from: workout.endDate),
      ]
    }
  }
}
