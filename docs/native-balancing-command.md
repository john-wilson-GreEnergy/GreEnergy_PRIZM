# Native balancing command validation

The deployed EMS `turtle.war` includes a protobuf `SetStringBalancingConfiguration` command (payload field 30). Its default `BatteryPackBalancingConfiguration` has `chargeDeadband` at field 5 and `dischargeDeadband` at field 6. The legacy `/tools/controls/ems/.../balance/avg` and `/balance/provided/...` handlers do not accept those values; query parameters were silently ignored, and BMS readback showed 0/0 instead of the requested 10/50 mV.

PRIZM now builds the native protobuf in `src/server/balancingCommandProto.ts`. Active balancing sends it to the EMS binary command endpoint only when `PRIZM_BALANCING_PROTO_ENABLED=true`. With the flag absent or false, active balancing fails closed before any ADB or rotation preparation. Stop balancing retains its existing Turtle URL. The old URL helper now rejects active balancing so it cannot falsely claim to apply deadbands.

Offline checks: `npx tsx src/server/balancingCommandProto.test.ts` and `npx tsx src/server/balancingControlService.test.ts`. These establish the protobuf field encoding and legacy-path guard, but do not establish live EMS acceptance or BMS application.

Before enabling at a site, perform a supervised one-string test with ADB/rotation preflight, record the requested deadbands and command ID, verify EMS acceptance, then independently confirm every BPC's mode and deadbands in fresh readback and persistence after at least one ADB cycle. If acceptance or readback fails, leave the flag disabled and investigate; do not interpret HTTP acceptance or active shunts alone as proof of the requested settings. Do not test an entire array before one-string parity has been demonstrated.
