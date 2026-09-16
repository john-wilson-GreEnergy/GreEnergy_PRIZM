on run
    set appRoot to POSIX path of (path to me)
    set launcherScript to appRoot & "Contents/Resources/start.sh"
    try
        display dialog "Checking PRIZM and the EMS connection…" with title "PRIZM Launcher" buttons {"Continue"} default button 1 giving up after 2
        do shell script (quoted form of launcherScript)
    on error errorMessage
        display alert "PRIZM Launcher" message errorMessage
    end try
end run
