"""Offline tests; never invoke sudo, systemctl, ip, Node, or equipment."""
import hashlib
import os
from pathlib import Path
import runpy
import tempfile
import unittest

BASE = Path(__file__).resolve().parent
helper = runpy.run_path(str(BASE / 'prizmMaintenance.py'))
setup = runpy.run_path(str(BASE / 'setupPrizmMaintenance.py'))


class MaintenanceTests(unittest.TestCase):
    def test_fixed_commands_only(self):
        self.assertEqual(helper['ACTIONS'], setup['ACTIONS'])
        for action in helper['ACTIONS']:
            args = helper['command'](action)
            self.assertTrue(args[0].startswith('/usr/'))
            self.assertNotIn('sh', args)
            self.assertNotIn('bash', args)
        for action in ('', 'restart', 'restart-ss3 --no-block', 'restart-ssh',
                       'deploy /tmp/evil', 'shell', ';sh', '../status', 'reboot'):
            with self.assertRaises(ValueError):
                helper['command'](action)
        self.assertEqual(helper['command']('restart-ss4'),
                         ['/usr/bin/systemctl', 'restart', 'prizm-site@ss4.service'])
        self.assertEqual(helper['command']('deploy-shift')[-1], 'apply')
        self.assertEqual(helper['command']('rollback-shift')[-1], 'rollback')

    def test_environment_is_not_inherited(self):
        self.assertEqual(set(helper['ENV']), {'PATH', 'HOME', 'LANG', 'NODE_EXTRA_CA_CERTS'})
        self.assertNotIn('NODE_OPTIONS', helper['ENV'])
        self.assertNotIn('PYTHONPATH', helper['ENV'])
        self.assertTrue((BASE / 'prizmMaintenance.py').read_text().startswith('#!/usr/bin/python3 -I'))

    def test_pinned_payload_and_no_links(self):
        with tempfile.TemporaryDirectory(prefix='prizm-maintenance-test-') as directory:
            file = Path(directory) / 'payload'
            file.write_bytes(b'fixture')
            digest = hashlib.sha256(b'fixture').hexdigest()
            self.assertEqual(setup['pinned_read'](file, digest, os.getuid()), b'fixture')
            with self.assertRaises(ValueError):
                setup['pinned_read'](file, '0' * 64, os.getuid())
            with self.assertRaises(ValueError):
                setup['pinned_read'](file, digest, os.getuid() + 1)
            link = Path(directory) / 'link'
            link.symlink_to(file)
            with self.assertRaises(OSError):
                setup['pinned_read'](link, digest, os.getuid())

    def test_exact_approved_source(self):
        rules = '# PRIZM fixed actions only. No wildcard commands or caller-supplied paths.\n'
        rules += ''.join(f'ebc ALL=(root) NOPASSWD: NOSETENV: /usr/local/sbin/prizm-maintenance {action}\n' for action in setup['ACTIONS'])
        self.assertEqual(rules, (BASE / 'prizm-maintenance.sudoers').read_text())
        files = {'prizm-maintenance.py': BASE / 'prizmMaintenance.py',
                 'prizm-shift-deploy.mjs': BASE.parent / 'deploy-shift-sessions.mjs'}
        for name, file in files.items():
            self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), setup['PINNED'][name])
        original = files['prizm-shift-deploy.mjs'].read_bytes()
        transformed = setup['prepare_deployer'](original).decode()
        self.assertIn("const archive='/usr/local/lib/prizm-maintenance/shift.tgz'", transformed)
        self.assertNotIn("const report='/home/ebc/", transformed)
        self.assertNotIn('fs.chownSync(report,owner.uid,owner.gid)', transformed)
        with self.assertRaises(ValueError):
            setup['prepare_deployer'](b'unreviewed code')


if __name__ == '__main__':
    unittest.main()
