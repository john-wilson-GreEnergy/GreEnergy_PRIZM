#!/bin/bash
# PRIZM Provisioning Template
# Reference / preview asset for controlled provisioning planning.
# Do not store credentials in this file.
# Do not run manually unless reviewed and approved for the target site.


#set vm min_free_kbytes.  (memory reserved for OS)
echo 16384 | sudo tee /proc/sys/vm/min_free_kbytes
echo vm.min_free_kbytes=16384 | sudo tee /etc/sysctl.d/zzz-feather.conf
