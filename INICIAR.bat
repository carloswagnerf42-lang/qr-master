@echo off
chcp 65001 > nul
title QR MASTER — Plataforma Profissional de QR Codes
color 0B

echo ====================================================================
echo                 QR MASTER — INICIALIZADOR AUTOMATICO
echo ====================================================================
echo.
cd /d "%~dp0"

echo [1/2] Verificando dependencias...
where node >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO] Node.js nao foi encontrado!
    pause
    exit /b 1
)

echo [2/2] Iniciando servidor e abrindo navegador...
echo.
echo --------------------------------------------------------------------
echo   Acesse: http://localhost:3000
echo   Usuario: carlos@qrmaster.com
echo   Senha:   senha123
echo --------------------------------------------------------------------
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"
call npm.cmd run dev

pause
