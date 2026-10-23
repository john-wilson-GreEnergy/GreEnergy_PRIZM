#!/usr/bin/python3 -I
"""Root-owned, fixed-action PRIZM maintenance entry. No caller-supplied paths."""
import fcntl
import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import syslog

ROOT = Path('/usr/local/lib/prizm-maintenance')
DEPLOY = ROOT / 'shift-deploy.mjs'
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root', 'LANG': 'C',
       'NODE_EXTRA_CA_CERTS': '/etc/prizm-fleet/fleet/ca-cert.pem'}
SERVICES = ('prizm.service', 'prizm-site@ss4.service', 'prizm-fleet.service')
ACTIONS = ('status', 'check-ss3', 'check-ss4', 'check-fleet',
           'restart-ss3', 'restart-ss4', 'restart-fleet', 'deploy-shift', 'rollback-shift')


def command(action):
    if action == 'status':
        return ['/usr/bin/systemctl', 'show', *SERVICES, '-p', 'Id', '-p', 'ActiveState',
                '-p', 'MainPID', '-p', 'NRestarts']
    for label, service, site in zip(('ss3', 'ss4', 'fleet'), SERVICES,
                                    ('solar-star-3', 'solar-star-4', 'fleet')):
        if action == 'restart-' + label:
            return ['/usr/bin/systemctl', 'restart', service]
        if action == 'check-' + label:
            return ['/usr/sbin/ip', 'netns', 'exec', 'prizm-fleet', '/usr/bin/node',
                    str(DEPLOY), '--probe', site, 'updated']
    if action in ('deploy-shift', 'rollback-shift'):
        return ['/usr/bin/node', str(DEPLOY), 'apply' if action == 'deploy-shift' else 'rollback']
    raise ValueError('Unsupported maintenance action')


def trusted(file, directory=False):
    info = file.lstat()
    kind = stat.S_ISDIR if directory else stat.S_ISREG
    if not kind(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise RuntimeError('Untrusted maintenance installation')


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise ValueError('Use sudo prizm-maintenance with one approved action')
    action = sys.argv[1]
    args = command(action)  # Validate before touching any files or invoking a program.
    for directory in (Path('/usr'), Path('/usr/local'), Path('/usr/local/lib'), ROOT):
        trusted(directory, True)
    trusted(Path(__file__))
    trusted(ROOT / 'manifest.json')
    import json
    manifest = json.loads((ROOT / 'manifest.json').read_text())
    for name in ('shift-deploy.mjs', 'shift.tgz'):
        file = ROOT / name
        trusted(file)
        if hashlib.sha256(file.read_bytes()).hexdigest() != manifest[name]:
            raise RuntimeError('Approved maintenance payload has changed')
    descriptor = os.open(ROOT / 'maintenance.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Another maintenance action is in progress') from None
        syslog.openlog('prizm-maintenance', facility=syslog.LOG_AUTHPRIV)
        syslog.syslog(syslog.LOG_NOTICE, 'begin action=' + action)
        result = subprocess.run(args, cwd=str(ROOT), env=ENV, check=False)
        syslog.syslog(syslog.LOG_NOTICE, 'end action=' + action + ' status=' + str(result.returncode))
        return result.returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError) as error:
        print('Maintenance refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
