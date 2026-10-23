#!/usr/bin/python3 -I
"""One-time administrator bootstrap. Installs access only; never restarts services."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess
import sys

ROOT = Path('/usr/local/lib/prizm-maintenance')
HELPER = Path('/usr/local/sbin/prizm-maintenance')
RULE = Path('/etc/sudoers.d/prizm-maintenance')
PENDING = Path('/etc/sudoers.d/prizm-maintenance.pending')
ENV = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'HOME': '/root', 'LANG': 'C'}
PINNED = {
    'prizm-maintenance.py': '8555fcf5d3a29faad75ae158e9450c0416dc634446e3a30293da32b8a6bebaba',
    'prizm-shift-deploy.mjs': '235636f43b02b8148db30537b4cd69c1ddd2782aab6e3e67357e596c83831571',
    'prizm-shift-20261002.tgz': 'b98abf221a2b7b372ca8f7af080d6dca20de1e1773360b5171a46a76ac573f5f',
}
ACTIONS = ('status', 'check-ss3', 'check-ss4', 'check-fleet', 'restart-ss3',
           'restart-ss4', 'restart-fleet', 'deploy-shift', 'rollback-shift')


def pinned_read(file, expected, owner):
    with os.fdopen(os.open(file, os.O_RDONLY | os.O_NOFOLLOW), 'rb') as stream:
        info = os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_size > 32 * 1024 * 1024:
            raise ValueError('Invalid staged payload: ' + file.name)
        data = stream.read(32 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != expected:
        raise ValueError('Checksum mismatch: ' + file.name)
    return data


def trusted_directory(file):
    info = file.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Unsafe installation directory: ' + str(file))


def prepare_deployer(data):
    text = data.decode()
    replacements = {
        "const archive='/home/ebc/prizm-shift-20261002.tgz';": "const archive='/usr/local/lib/prizm-maintenance/shift.tgz';",
        "const report='/home/ebc/prizm-shift-result.json';": "const report='/usr/local/lib/prizm-maintenance/shift-result.json';",
        "const owner=fs.statSync('/home/ebc');fs.chownSync(report,owner.uid,owner.gid);": "fs.chownSync(report,0,0);",
    }
    for old, new in replacements.items():
        if text.count(old) != 1:
            raise ValueError('Unexpected deployment script format')
        text = text.replace(old, new)
    return text.encode()


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise ValueError('Run once with sudo python3 -I and no additional arguments')
    account = pwd.getpwnam('ebc')
    for directory in ('/usr', '/usr/local', '/usr/local/lib', '/usr/local/sbin', '/etc', '/etc/sudoers.d'):
        trusted_directory(Path(directory))
    for file in (ROOT, HELPER, RULE, PENDING):
        if os.path.lexists(file):
            raise ValueError('Target already exists; refusing to replace: ' + str(file))
    payloads = {name: pinned_read(Path('/home/ebc') / name, digest, account.pw_uid)
                for name, digest in PINNED.items()}
    payloads['prizm-shift-deploy.mjs'] = prepare_deployer(payloads['prizm-shift-deploy.mjs'])
    subprocess.run(['/usr/sbin/visudo', '-c'], env=ENV, cwd='/', check=True)
    created = []
    made_directory = False

    def install(file, data, mode):
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
        created.append(file)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), mode)
            os.fchown(stream.fileno(), 0, 0)

    try:
        ROOT.mkdir(mode=0o700)
        made_directory = True
        install(ROOT / 'shift-deploy.mjs', payloads['prizm-shift-deploy.mjs'], 0o600)
        install(ROOT / 'shift.tgz', payloads['prizm-shift-20261002.tgz'], 0o600)
        manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
                    for name in ('shift-deploy.mjs', 'shift.tgz')}
        install(ROOT / 'manifest.json', json.dumps(manifest).encode(), 0o600)
        install(HELPER, payloads['prizm-maintenance.py'], 0o755)
        subprocess.run(['/usr/bin/node', '--check', str(ROOT / 'shift-deploy.mjs')], env=ENV, cwd='/', check=True)
        subprocess.run(['/usr/bin/node', str(ROOT / 'shift-deploy.mjs'), '--self-test'], env=ENV, cwd='/', check=True)
        subprocess.run(['/usr/bin/node', str(ROOT / 'shift-deploy.mjs'), '--check-archive'], env=ENV, cwd='/', check=True)
        rules = '# PRIZM fixed actions only. No wildcard commands or caller-supplied paths.\n'
        rules += ''.join(f'ebc ALL=(root) NOPASSWD: NOSETENV: {HELPER} {action}\n' for action in ACTIONS)
        install(PENDING, rules.encode(), 0o440)
        subprocess.run(['/usr/sbin/visudo', '-cf', str(PENDING)], env=ENV, cwd='/', check=True)
        os.rename(PENDING, RULE)
        created.remove(PENDING)
        created.append(RULE)
        subprocess.run(['/usr/sbin/visudo', '-c'], env=ENV, cwd='/', check=True)
        print('Restricted PRIZM maintenance access installed. No services restarted.')
        print('Access applies to the existing ebc account. New release packages require administrator enrollment.')
    except BaseException:
        # Remove only paths created by this invocation, with the sudo rule removed first.
        for file in reversed(created):
            file.unlink(missing_ok=True)
        if made_directory:
            ROOT.rmdir()
        raise


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print('Setup stopped: ' + str(error), file=sys.stderr)
        sys.exit(1)
