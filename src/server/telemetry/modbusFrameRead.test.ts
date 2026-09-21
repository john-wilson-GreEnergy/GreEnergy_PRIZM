import assert from "node:assert/strict";
import net from "node:net";
import { queryModbusRaw } from "./modbusProfileManager";

const server = net.createServer((socket) => {
  socket.once("data", (request) => {
    const response = Buffer.alloc(13);
    request.copy(response, 0, 0, 2); // transaction ID
    response.writeUInt16BE(0, 2); // Modbus protocol
    response.writeUInt16BE(7, 4); // unit + function + byte count + two registers
    response.writeUInt8(1, 6);
    response.writeUInt8(3, 7);
    response.writeUInt8(4, 8);
    response.writeUInt16BE(103, 9);
    response.writeUInt16BE(1400, 11);
    socket.write(response.subarray(0, 5));
    setTimeout(() => socket.write(response.subarray(5)), 10);
  });
});

try {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const result = await queryModbusRaw("127.0.0.1", address.port, 1, 0, 70, 2, 1000);
  assert.deepEqual(result.registers, [103, 1400]);
  console.log("modbusFrameRead fragmented response test passed");
} finally {
  server.close();
}
