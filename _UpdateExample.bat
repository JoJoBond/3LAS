@echo OFF

robocopy .\client\src .\example\client\script *.js /s
robocopy .\server\src .\example\server *.js *.json /s /XD node_modules

pause