#!/bin/bash

#set vm min_free_kbytes.  (memory reserved for OS)
echo 16384 | sudo tee /proc/sys/vm/min_free_kbytes
echo vm.min_free_kbytes=16384 | sudo tee /etc/sysctl.d/zzz-feather.conf
