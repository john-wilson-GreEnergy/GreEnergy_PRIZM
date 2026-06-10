const http = require('http');

function check() {
    http.get("http://localhost:3000/api/local/strings/dashboard", res => {
        console.log("/strings/dashboard:");
        console.log("Status:", res.statusCode);
        console.log("Content-Type:", res.headers['content-type']);
        let body = "";
        res.on('data', c => body += c);
        res.on('end', () => console.log(body.substring(0, 100)));
    });

    http.get("http://localhost:3000/api/local/safety-fault-clear/candidates", res => {
        console.log("/safety-fault-clear/candidates:");
        console.log("Status:", res.statusCode);
        console.log("Content-Type:", res.headers['content-type']);
        let body = "";
        res.on('data', c => body += c);
        res.on('end', () => console.log(body.substring(0, 500)));
    });
}
check();
