#!/bin/bash
# PRIZM Provisioning Template
# Reference / preview asset for controlled provisioning planning.
# Do not store credentials in this file.
# Do not run manually unless reviewed and approved for the target site.

UPDATE_PATH='/etc/powin/fw/feather/deploy/'
UPDATE_READY_FILE='UPDATEREADY'
APP_NAME='feather'
WAR_FILE=${APP_NAME}.war
UPDATE_FILE=${APP_NAME}-*.war
INSTALL_PATH='/var/lib/tomcat8/webapps/'
TEST_URL=https://localhost:8443/${APP_NAME}/status

TMP_FILE='tmp.war'
RECOVERY_FILE=war.recover

# if <file> doesn't exist, we're done.
if [ -f ${UPDATE_PATH}${UPDATE_READY_FILE} ]
then
  
  echo "$(date) -- Upgrade system script started"
  
  echo "$(date) -- Stopping Tomcat..."
  /usr/sbin/service tomcat8 stop
  TOMCAT_STOPPED=$?
  if [ ${TOMCAT_STOPPED} -eq 0 ]
  then
    echo "$(date) -- Tomcat stopped"
  else
    echo "$(date) -- Tomcat failed to stop"
  fi

  sleep 30
  UPDATE_FILE_NAME=$(find ${UPDATE_PATH}${UPDATE_FILE})
  echo "$(date) -- Updating feather with ${UPDATE_FILE_NAME}"

  # move it to another file name so we don't trigger again
  rm -f ${UPDATE_PATH}${UPDATE_READY_FILE}
  mv -f ${UPDATE_PATH}${UPDATE_FILE} ${UPDATE_PATH}${TMP_FILE}

  # clear any previous result files
  rm -f ${UPDATE_PATH}UPDATE*

  # preserve the previous .war
  mv -f ${INSTALL_PATH}${WAR_FILE} ${INSTALL_PATH}${RECOVERY_FILE}
  rm -rf ${INSTALL_PATH}${APP_NAME}*

  # copy the new .war into place
  chmod a+r ${UPDATE_PATH}${TMP_FILE}
  cp -f ${UPDATE_PATH}${TMP_FILE} ${INSTALL_PATH}${WAR_FILE}
  
  process_id=$(ps -ef | grep "java" | grep -v "grep" | awk '{print $2}')
  if [ -z "${process_id}" ]
  then
      echo "$(date) -- Tomcat process not found and stopped cleanly"
  else
      kill -3 ${process_id}
      kill -9 ${process_id}
      echo "$(date) -- Tomcat process found and did not stop cleanly, killing process id ${process_id}"
  fi
  
  echo "$(date) -- Starting Tomcat..."
  /usr/sbin/service tomcat8 start

  # take a shallow breath
  echo "$(date) -- Pausing for 90 seconds to allow WAR to deploy..."
  sleep 90

  echo "$(date) -- Checking for Tomcat process..."
  ps -ef | grep "java" | grep -v "grep"
  
  # Is it in the process table? Does it respond?
  ps -ef | grep "java" | grep -v "grep" > /dev/null
  PROCESS_FOUND=$?
  
  if [ ${PROCESS_FOUND} -eq 0 ]
  then
    echo "$(date) -- Tomcat process found"
    # Clean up and let Houston know it worked
    rm -f ${UPDATE_PATH}${TMP_FILE} ${INSTALL_PATH}${RECOVERY_FILE}
    touch ${UPDATE_PATH}UPDATEOK
    echo "$(date) -- Update successfully installed and restarted"
  # If either of the above is false, write a log and set indicator file.
  else
    echo "$(date) -- Update failed, returning to previous version"
    mv -f ${INSTALL_PATH}${RECOVERY_FILE} ${INSTALL_PATH}${WAR_FILE}
    touch ${UPDATE_PATH}UPDATEFAILED
  fi
  
  echo "$(date) -- Upgrade system script finished"
  
fi
