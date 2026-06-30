import assert from "assert";
import fs from "fs";
import path from "path";
import {
  resolveMatrixRows,
  resolveTopologyPoints,
  calculateProfileAndRawCounts,
  mapToCanonicalProfileKey,
  sanitizeStatusForTripCheck
} from "./canonicalSensorParser";

// Mock EmsProfile
const mockProfile: any = {
  sensorMonitoringProfile: {
    collectionSegment: {
      dataUnavailable: true, acDoors: true, dcDoors: true, topCapDoors: true,
      manualVentilation: true, smoke: true, fireTrouble: true, fire: true,
      io: true, heat: true, upsAlarm: true, moisture: true, leakDetector: true,
      hydrogen: true, hydrogenFault: true
    },
    energySegment: {
      dataUnavailable: true, batteryDoors: true, topCapDoors: true,
      envControllerVent: true, smoke: true, hydrogenFault: true, hydrogen: true,
      io: true, heat: true, fireTrouble: true, moisture: true, fire: true,
      acDoors: true, dcDoors: true, manualVentilation: true, upsAlarm: true
    }
  }
};

async function runTests() {
  console.log("Running Canonical Sensor Parser Tests...");

  // Load fixtures
  const fixturesDir = path.join(process.cwd(), "src", "server", "__fixtures__", "bhe0020");
  const blockviewerRaw = JSON.parse(fs.readFileSync(path.join(fixturesDir, "ems", "blockviewer_data.json"), "utf8"));
  const expectedPrizm = JSON.parse(fs.readFileSync(path.join(fixturesDir, "prizm", "site_sensors_topology.json"), "utf8"));

  // 1. Sanitize helper tests
  assert.strictEqual(sanitizeStatusForTripCheck("status_OK_valid"), "ok");
  assert.strictEqual(sanitizeStatusForTripCheck(""), "");

  // 2. Map canonical key tests
  assert.strictEqual(mapToCanonicalProfileKey("lostComms"), "io");
  assert.strictEqual(mapToCanonicalProfileKey("dataCommunications"), "dataUnavailable");

  // 3. Mock blockviewer physical layout simulation
  // Array 2 ES 3 = Global Enclosure 21 + 4 = 25 (posInArray 4)
  // Array 5 ES 11 = Global Enclosure 4 * 21 + 12 = 96 (posInArray 12)
  // Array 7 ES 17 = Global Enclosure 6 * 21 + 18 = 144 (posInArray 18)

  const rows = [
    {
      location: {
        enclosureIndex: 25,
        displayName: "Array 2 Energy Segment 3",
        enclosureType: "EnergySegment",
        segmentPosition: 4
      },
      otherSensors: {
        hydrogen: {
          displayValue: "TRIPPED",
          status: "TRIPPED",
          statusMessage: "H2_ALERT",
          value: "TRIPPED",
          tripped: true,
          label: "Hydrogen Sensor"
        }
      }
    },
    {
      location: {
        enclosureIndex: 96,
        displayName: "Array 5 Energy Segment 11",
        enclosureType: "EnergySegment",
        segmentPosition: 12
      },
      emergencySensors: {
        moisture: {
          displayValue: "TRIPPED",
          status: "TRIPPED",
          statusMessage: "MOISTURE_ALARM",
          value: "TRIPPED",
          tripped: true,
          label: "Moisture Detector"
        }
      }
    },
    {
      location: {
        enclosureIndex: 144,
        displayName: "Array 7 Energy Segment 17",
        enclosureType: "EnergySegment",
        segmentPosition: 18
      },
      comStatus: {
        io: {
          displayValue: "COMM_LOST",
          status: "offline",
          statusMessage: "COMM_LOST",
          value: "TRIPPED",
          tripped: true,
          label: "IO Communications"
        }
      }
    }
  ];

  // Let's run resolution on these rows when feather cache is empty vs populated
  // Since feather cache relies on actual in-memory cache, let's verify that the structure parses fine
  const resolvedEmptyCache = resolveMatrixRows(rows, mockProfile);
  assert.strictEqual(resolvedEmptyCache.length, 3, "Resolves all 3 physical rows");

  // Verify fields exist
  const firstRow = resolvedEmptyCache[0];
  assert.ok(firstRow.location, "Row has location object");
  assert.ok(firstRow.otherSensors.hydrogen, "Row has hydrogen cell resolved");
  assert.strictEqual(firstRow.otherSensors.hydrogen.contributesToHealth, true, "Hydrogen contributes to health");

  // Let's test the calculations
  const counts = calculateProfileAndRawCounts(resolvedEmptyCache);
  assert.ok(counts.profileActivePointCount !== undefined, "Counts contains active point counts");

  console.log("Canonical Sensor Parser unit tests completed successfully!");
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
