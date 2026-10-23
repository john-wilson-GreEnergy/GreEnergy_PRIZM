export const release='/opt/prizm-fleet/releases/remote-20261019';
export const remoteConfig='/etc/prizm-fleet/fleet/remote.json';
export const fleetOverride=`[Service]
ExecStart=
ExecStart=/usr/bin/node ${release}/dist/fleet-server.cjs
WorkingDirectory=${release}
Group=prizm-remote
SupplementaryGroups=prizm-fleet
RuntimeDirectory=prizm-remote
RuntimeDirectoryMode=0710
RuntimeDirectoryPreserve=no
ReadWritePaths=/run/prizm-remote
Environment=PRIZM_REMOTE_CONFIG=${remoteConfig}
`;
const hardening=`NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
LockPersonality=yes
CapabilityBoundingSet=
RestrictAddressFamilies=AF_UNIX AF_INET
UMask=0077
`;
export const keysService=`[Unit]
Description=PRIZM remote public verification key refresh
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
User=prizm-keyfetch
Group=prizm-keyfetch
ExecStart=/usr/bin/node ${release}/refreshRemoteKeys.mjs
StateDirectory=prizm-remote-keys
StateDirectoryMode=0755
ReadWritePaths=/var/lib/prizm-remote-keys
InaccessiblePaths=/etc/prizm-fleet /var/lib/prizm-fleet -/run/prizm-remote /run/netns
TimeoutStartSec=30
IPAddressDeny=10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 127.0.0.0/8
IPAddressAllow=127.0.0.53/32
${hardening}`;
export const keysTimer=`[Unit]
Description=Refresh PRIZM remote verification keys hourly
[Timer]
OnBootSec=1min
OnUnitActiveSec=1h
RandomizedDelaySec=60
Persistent=true
[Install]
WantedBy=timers.target
`;
export const tunnelService=`[Unit]
Description=PRIZM read-only mobile Cloudflare connector
After=network-online.target prizm-fleet.service
Wants=network-online.target
ConditionPathExists=/etc/prizm-remote/tunnel.token
[Service]
User=prizm-tunnel
Group=prizm-remote
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate --edge-ip-version 4 --protocol http2 --loglevel warn --metrics 127.0.0.1:0 run --token-file /etc/prizm-remote/tunnel.token
Restart=on-failure
RestartSec=10
TimeoutStopSec=40
InaccessiblePaths=/etc/prizm-fleet /var/lib/prizm-fleet /var/lib/prizm-remote-keys /run/netns
# Unix sockets are unaffected. Permit only DNS and Cloudflare tunnel edges;
# no TCP path to the equipment LANs, full workspaces or host administration.
IPAddressDeny=any
IPAddressAllow=127.0.0.53/32 198.41.192.0/24 198.41.200.0/24
${hardening}[Install]
WantedBy=multi-user.target
`;
