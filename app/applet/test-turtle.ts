const fs = require('fs');
fetch('http://localhost:3000/api/local/strings/dashboard/3/1/detail?refresh=true&captureHistory=true')
    .then(r => r.json())
    .then(data => console.log({ count: data.balancingDetails?.length, hasBM: data.hasBalancingMap }));
fetch('http://localhost:3000/api/local/strings/dashboard/3/1/detail/raw')
    .then(r => r.json())
    .then(data => console.log(Object.keys(data), data.balancingMapType, data.balancingMapKeys));
