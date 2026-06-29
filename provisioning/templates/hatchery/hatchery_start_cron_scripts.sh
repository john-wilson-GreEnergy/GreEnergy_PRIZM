#!/bin/bash

SCRIPT_PATH='/etc/powin/scripts/'
SUDO_USER='tomcat8'
CRON_DIR=${1:-null}
CRON_SCRIPTS=${@: 2}

if [ ! -d ${CRON_DIR} ]; then
  echo "=========================================="
  echo "[USAGE]: ./hatchery_tar_directory.sh -CRON_SCRIPTS_DIRECTORY -CRON_SCRIPTS(variable length)"
  echo "[INPUT]: ./hatchery_tar_directory.sh  \"$CRON_DIR\" \"$CRON_SCRIPTS\""
  echo "=========================================="
  exit 10
fi

# Install scripts in /etc/powin/scripts
cd ${CRON_DIR}
for f in ${@: 2}
do
  echo 'Processing script '${f}

  if ! (sudo ls | grep -q ${f}); then
    echo "Cannot start " ${f} " : script doesn't exist."
  else
    chmod u+x $f
    cp -f ./$f $SCRIPT_PATH
    if ! (sudo crontab -u root -l | grep -q ${f}); then
      
      if (echo ${f} | grep -q script_configurationPackage.sh); then
        CRONLINE="0 * * * * ${SCRIPT_PATH}${f} >> /var/log/tomcat8/${f}.log 2>&1"
      else 
        CRONLINE="* * * * * ${SCRIPT_PATH}${f} >> /var/log/tomcat8/${f}.log 2>&1"
      fi
      
      (sudo crontab -u root -l; echo "$CRONLINE" ) | sudo crontab -u root - 
      echo ${f}" added to CRON"
    else
      echo ${f}" already present"
    fi
  fi
  echo  
done

#Change the permissions of the contents of the folder
sudo chmod -R u+rw $SCRIPT_PATH
sudo chmod -R a+r $SCRIPT_PATH
cd ..
