// Basic demo script: sensors and WebAudio siren simulation
(function(){
    const sensorsEl = document.getElementById('sensors');
    
    // Global sensor data with realistic parameters
    window.sensorData = [
        {id:'S-01', name:'Pluviômetro - Zona Norte', type:'rain', value:12, unit:'mm/h', normalRange:[0,20], warnRange:[20,40], min:0, max:100},
        {id:'S-02', name:'Nível do Rio - Zona Leste', type:'river', value:3.8, unit:'m', normalRange:[1,3.5], warnRange:[3.5,4.5], min:1, max:6},
        {id:'S-03', name:'Anemômetro - Zona Sul', type:'wind', value:8, unit:'km/h', normalRange:[0,30], warnRange:[30,60], min:0, max:120},
        {id:'S-04', name:'Estação Meteo - Centro', type:'weather', value:'Normal', unit:'', normalRange:[0,1], warnRange:[1,2], min:0, max:3}
    ];

    // Configuration: limiares de criticidade (ajustáveis)
    const thresholds = {
        rain: { warn: 35, danger: 75 },   // mm/h
        river: { warn: 4.0, danger: 5.0 }, // meters
        wind: { warn: 40, danger: 60 }    // km/h
    };

    // expose for other modules / dev console
    window.thresholds = thresholds;

    // Histórico de amostras para os gráficos (exposto globalmente)
    window.sensorHistory = { timestamps: [], rain: [], wind: [], river: [], maxLen: 60 };

    function getSensorLevel(sensor){
        if(sensor.type === 'weather') return sensor.value === 'Normal' ? '' : (sensor.value === 'Atenção' ? 'warn' : 'danger');
        const val = sensor.value;
        // Use configured thresholds when available
        if(sensor.type === 'rain'){
            if(val >= thresholds.rain.danger) return 'danger';
            if(val >= thresholds.rain.warn) return 'warn';
            return '';
        }
        if(sensor.type === 'river'){
            if(val >= thresholds.river.danger) return 'danger';
            if(val >= thresholds.river.warn) return 'warn';
            return '';
        }
        if(sensor.type === 'wind'){
            if(val >= thresholds.wind.danger) return 'danger';
            if(val >= thresholds.wind.warn) return 'warn';
            return '';
        }
        // fallback to original logic
        if(val >= sensor.warnRange[1] || val >= 5) return 'danger';
        if(val >= sensor.warnRange[0]) return 'warn';
        return '';
    }

    function getSensorDisplay(sensor){
        if(sensor.type === 'weather') return sensor.value;
        const level = getSensorLevel(sensor);
        if(level === 'danger') return 'Perigo';
        if(level === 'warn') return 'Atenção';
        return 'Normal';
    }

    function renderSensors(){
        sensorsEl.innerHTML = '';
        window.sensorData.forEach(s=>{
            const div = document.createElement('div');
            div.className = 'sensor';
            const level = getSensorLevel(s);
            const display = getSensorDisplay(s);
            const valueText = s.type === 'weather' ? s.value : (s.value.toFixed(1) + ' ' + s.unit);
            div.innerHTML = '<div><strong>'+s.name+'</strong><div class="muted" style="font-size:12px;margin-top:6px">'+valueText+'</div></div><div style="text-align:right"><div class="dot '+(level)+'" aria-hidden="true"></div></div>';
            sensorsEl.appendChild(div);
        });
    }

    renderSensors();

    // Expose functions globally for dev panel
    window.updateSensors = renderSensors;
    window.getSensors = () => window.sensorData;

    document.getElementById('refresh').addEventListener('click', ()=> {
        // Realistic random variation
        window.sensorData[0].value = Math.max(0, Math.min(100, window.sensorData[0].value + (Math.random() - 0.5) * 10));
        window.sensorData[2].value = Math.max(0, Math.min(120, window.sensorData[2].value + (Math.random() - 0.5) * 15));
        renderSensors();
    });

    // WebAudio siren
    let audioCtx, oscillator, gainNode, sirenInterval;
    // Secondary alarm (beep pattern) used when multiple sensors are critical
    let secondaryOsc, secondaryGain, secondaryInterval;

    function startSiren(){
        if(audioCtx) return;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // expose to global so other modules can check state reliably
        window.audioCtx = audioCtx;

        oscillator = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(400, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        oscillator.start();

        // fade in
        gainNode.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.5);

        // sweep frequency to simulate siren
        let up = true;
        sirenInterval = setInterval(()=>{
            const now = audioCtx.currentTime;
            if(up){
                oscillator.frequency.linearRampToValueAtTime(1600, now + 0.9);
            } else {
                oscillator.frequency.linearRampToValueAtTime(400, now + 0.9);
            }
            up = !up;
        }, 900);
        
        // Update siren status
        const sirenStatus = document.getElementById('sirenStatus');
        if(sirenStatus){
            sirenStatus.textContent = 'Ativa';
            sirenStatus.className = 'dev-status danger';
        }
    }

    function stopSiren(){
        if(!audioCtx) return;
        clearInterval(sirenInterval);
        if(gainNode && audioCtx){
            gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.5);
        }
        setTimeout(()=>{
            try{
                if(oscillator) oscillator.stop();
                if(oscillator) oscillator.disconnect();
                if(gainNode) gainNode.disconnect();
                if(audioCtx) audioCtx.close();
            }catch(e){/* ignore */}
            audioCtx = oscillator = gainNode = null;
            // clear global marker
            window.audioCtx = null;
        }, 600);
        
        // Update siren status
        const sirenStatus = document.getElementById('sirenStatus');
        if(sirenStatus){
            sirenStatus.textContent = 'Desligada';
            sirenStatus.className = 'dev-status stopped';
        }
    }

    // Secondary alarm: short beeps (used when multiple sensors are critical)
    function startSecondaryAlarm(){
        if(secondaryOsc) return;
        // use a new small audio context if main siren not present, otherwise reuse audioCtx
        const ctx = window.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        secondaryOsc = ctx.createOscillator();
        secondaryGain = ctx.createGain();
        secondaryOsc.type = 'square';
        secondaryOsc.frequency.setValueAtTime(1000, ctx.currentTime);
        secondaryGain.gain.setValueAtTime(0.0001, ctx.currentTime);
        secondaryOsc.connect(secondaryGain);
        secondaryGain.connect(ctx.destination);
        try{ secondaryOsc.start(); } catch(e){}

        // beep pattern every 800ms
        secondaryInterval = setInterval(()=>{
            try{
                secondaryGain.gain.cancelScheduledValues(ctx.currentTime);
                secondaryGain.gain.setValueAtTime(0.0001, ctx.currentTime);
                secondaryGain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
                secondaryGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
            }catch(e){/* ignore */}
        }, 800);
        // expose marker
        window.secondaryAlarmActive = true;
    }

    function stopSecondaryAlarm(){
        if(!secondaryOsc) return;
        clearInterval(secondaryInterval);
        try{
            secondaryGain.gain.exponentialRampToValueAtTime(0.0001, (window.audioCtx || secondaryOsc.context).currentTime + 0.05);
        }catch(e){}
        setTimeout(()=>{
            try{ secondaryOsc.stop(); secondaryOsc.disconnect(); secondaryGain.disconnect(); }catch(e){}
            secondaryOsc = secondaryGain = null;
            window.secondaryAlarmActive = false;
        }, 120);
    }

    window.startSiren = startSiren;
    window.stopSiren = stopSiren;
    window.startSecondaryAlarm = startSecondaryAlarm;
    window.stopSecondaryAlarm = stopSecondaryAlarm;

    const demoBtn = document.getElementById('demoBtn');
    if(demoBtn){
        demoBtn.addEventListener('click', ()=>{
            startSiren();
            alert('Demonstração: alarme sonoro ativado. Em situação real, a sirene e mensagens automáticas orientariam a população.');
        });
    }
    
    const stopSirenBtn = document.getElementById('stopSiren');
    if(stopSirenBtn){
        stopSirenBtn.addEventListener('click', stopSiren);
    }

    // ensure stop on page unload
    window.addEventListener('beforeunload', stopSiren);
})();

// River Level Gauge: interactive visual representation
(function(){
    const riverLevel = document.getElementById('riverLevel');
    const riverValue = document.getElementById('riverValue');
    const lastUpdate = document.getElementById('lastUpdate');
    const changeRate = document.getElementById('changeRate');
    
    const increaseBtn = document.getElementById('increaseLevel');
    const decreaseBtn = document.getElementById('decreaseLevel');
    const resetBtn = document.getElementById('resetLevel');

    // Check if elements exist (graceful degradation)
    if(!riverLevel || !riverValue) return;

    let currentLevel = 3.8; // meters
    const minLevel = 1.0;
    const maxLevel = 6.0;

    function updateGauge(level){
        currentLevel = Math.max(minLevel, Math.min(maxLevel, level));
        
        // Calculate percentage (inverted: 0m at bottom, 6m at top)
        // Container height represents 0-6m, so percentage = level/6 * 100
        const percentage = (currentLevel / maxLevel) * 100;
        
        // Update visual height
        riverLevel.style.height = percentage + '%';
        riverValue.textContent = currentLevel.toFixed(1) + 'm';
        
        // Color coding based on risk
        let bgColor, riskText;
        if(currentLevel >= 5.0){
            bgColor = 'linear-gradient(180deg, rgba(255,95,87,0.7), rgba(255,95,87,0.9))';
            riskText = 'Perigo';
        } else if(currentLevel >= 4.0){
            bgColor = 'linear-gradient(180deg, rgba(255,184,107,0.6), rgba(255,184,107,0.8))';
            riskText = 'Atenção';
        } else {
            bgColor = 'linear-gradient(180deg, rgba(6,180,214,0.6), rgba(6,140,214,0.8))';
            riskText = 'Normal';
        }
        riverLevel.style.background = bgColor;
        
        // Update info box
        const parent = riverLevel.closest('.card');
        if(parent){
            let infoBox = parent.querySelector('.risk-info');
            if(!infoBox){
                infoBox = parent.querySelector('[style*="border-left"]');
            }
            if(infoBox){
                const strong = infoBox.querySelector('strong');
                const p = infoBox.querySelector('p');
                if(currentLevel >= 5.0){
                    infoBox.style.background = 'rgba(255,95,87,0.08)';
                    infoBox.style.borderLeftColor = '#ff5f57';
                    if(strong){ strong.textContent = 'Nível de Perigo'; strong.style.color = '#ff5f57'; }
                    if(p) p.textContent = 'Rio em nível crítico! Evacuação imediata das áreas de risco. Sirenes ativadas.';
                } else if(currentLevel >= 4.0){
                    infoBox.style.background = 'rgba(255,184,107,0.08)';
                    infoBox.style.borderLeftColor = '#ffb86b';
                    if(strong){ strong.textContent = 'Nível de Atenção'; strong.style.color = '#ffb86b'; }
                    if(p) p.textContent = 'Rio acima do limiar normal. Monitoramento reforçado ativo. Comunidades ribeirinhas foram notificadas.';
                } else {
                    infoBox.style.background = 'rgba(6,214,160,0.08)';
                    infoBox.style.borderLeftColor = '#06d6a0';
                    if(strong){ strong.textContent = 'Nível Normal'; strong.style.color = '#06d6a0'; }
                    if(p) p.textContent = 'Rio dentro dos parâmetros normais. Monitoramento de rotina mantido.';
                }
            }
        }
        
        // Update timestamp and rate
        if(lastUpdate) lastUpdate.textContent = 'Agora';
        if(changeRate){
            const rate = currentLevel >= 4.0 ? '+0.2 m/h' : currentLevel >= 3.0 ? '+0.1 m/h' : '0.0 m/h';
            changeRate.textContent = rate;
        }
    }

    // Event handlers
    if(increaseBtn) increaseBtn.addEventListener('click', ()=> updateGauge(currentLevel + 0.5));
    if(decreaseBtn) decreaseBtn.addEventListener('click', ()=> updateGauge(currentLevel - 0.5));
    if(resetBtn) resetBtn.addEventListener('click', ()=> updateGauge(3.8));

    // Initialize
    updateGauge(currentLevel);
    
    // Expose globally for dev panel and keep sensor synced
    window.updateRiverGauge = function(level){
        updateGauge(level);
        // Always sync with sensor 2
        if(window.sensorData && window.sensorData[1]){
            window.sensorData[1].value = level;
        }
    };
    window.getCurrentRiverLevel = () => currentLevel;
})();

// Developer Panel & Realistic Simulation Engine
(function(){
    // Wait for DOM to be fully loaded
    function initDevPanel(){
        const devPanel = document.getElementById('devPanel');
        const devToggle = document.getElementById('devToggle');
        
        console.log('Attempting to initialize Dev Panel...');
        console.log('devPanel element:', devPanel);
        console.log('devToggle element:', devToggle);
        
        if(!devPanel){
            console.error('devPanel element not found!');
            return;
        }
        
        if(!devToggle){
            console.error('devToggle element not found!');
            return;
        }
        
        console.log('Dev Panel elements found, attaching event listener...');
        
        // Toggle panel with immediate feedback
        devToggle.onclick = function(){
            console.log('Toggle button clicked!');
            console.log('Current classes:', devPanel.className);
            devPanel.classList.toggle('open');
            console.log('After toggle classes:', devPanel.className);
        };
        
        // Also try with addEventListener as backup
        devToggle.addEventListener('click', function(e){
            e.preventDefault();
            e.stopPropagation();
            console.log('Click event fired via addEventListener');
        });
        
        console.log('Event listener attached successfully');
        
        // Collapsible sections
        document.querySelectorAll('.dev-section h4').forEach(h4=>{
            h4.addEventListener('click', ()=> h4.parentElement.classList.toggle('collapsed'));
        });
        
        // Simulation State
        let simState = {
            active: true,
        speed: 1.0,
        time: 0,
        updateCount: 0,
        alertCount: 0,
        riverLevel: 3.8,
        riverRate: 0.2, // m/h
        autoUpdateInterval: 5000, // ms
        lastUpdate: Date.now()
    };
    
    let simTimer = null;
    let autoUpdateTimer = null;
    
    // Simulation Speed Control
    const simSpeed = document.getElementById('simSpeed');
    const simSpeedValue = document.getElementById('simSpeedValue');
    const simSpeedFill = document.getElementById('simSpeedFill');
    const simStatus = document.getElementById('simStatus');
    
    simSpeed.addEventListener('input', (e)=>{
        simState.speed = parseFloat(e.target.value);
        simSpeedValue.textContent = simState.speed.toFixed(1) + 'x';
        simSpeedFill.style.width = (simState.speed / 10 * 100) + '%';
        
        if(simState.speed === 0){
            pauseSimulation();
        } else if(!simState.active){
            startSimulation();
        }
    });
    
    // Simulation Controls
    document.getElementById('simPlay').addEventListener('click', startSimulation);
    document.getElementById('simPause').addEventListener('click', pauseSimulation);
    document.getElementById('simReset').addEventListener('click', resetSimulation);
    document.getElementById('simEmergency').addEventListener('click', triggerEmergency);
    
    function startSimulation(){
        simState.active = true;
        simStatus.textContent = 'Ativo';
        simStatus.className = 'dev-status active';
        
        if(!simTimer){
            simTimer = setInterval(runSimulationTick, 1000);
        }
        if(!autoUpdateTimer){
            autoUpdateTimer = setInterval(autoUpdateData, simState.autoUpdateInterval);
        }
    }
    
    function pauseSimulation(){
        simState.active = false;
        simStatus.textContent = 'Pausado';
        simStatus.className = 'dev-status paused';
        
        if(simTimer){
            clearInterval(simTimer);
            simTimer = null;
        }
        if(autoUpdateTimer){
            clearInterval(autoUpdateTimer);
            autoUpdateTimer = null;
        }
    }
    
    function resetSimulation(){
        simState.time = 0;
        simState.updateCount = 0;
        simState.alertCount = 0;
        simState.riverLevel = 3.8;
        simState.riverRate = 0.2;
        
        // Reset sensors
        window.sensorData[0].value = 12;
        window.sensorData[1].value = 3.8;
        window.sensorData[2].value = 8;
        window.sensorData[3].value = 'Normal';
        
        window.updateSensors();
        window.updateRiverGauge(3.8);
        updateDevStats();
        
        alert('Simulação resetada para valores iniciais.');
    }
    
    function triggerEmergency(){
        simState.riverLevel = 5.5;
        simState.riverRate = 0.8;
        
        window.sensorData[0].value = 85; // Heavy rain
        window.sensorData[1].value = 5.5;
        window.sensorData[2].value = 65; // Strong wind
        window.sensorData[3].value = 'Perigo';
        
        window.updateSensors();
        window.updateRiverGauge(5.5);
        window.startSiren();
        
        simState.alertCount++;
        updateDevStats();
        
        alert('🚨 EMERGÊNCIA SIMULADA! Todos os sensores em estado crítico. Sirenes ativadas.');
    }
    
    // Realistic Simulation Tick
    function runSimulationTick(){
        if(!simState.active || simState.speed === 0) return;
        
        const deltaTime = simState.speed; // seconds per tick scaled by speed
        simState.time += deltaTime;
        
        // Update river level with rate (convert m/h to m/s)
        const riverDelta = (simState.riverRate / 3600) * deltaTime;
        simState.riverLevel = Math.max(1, Math.min(6, simState.riverLevel + riverDelta));
        
        // Natural river rate decay (tends toward equilibrium)
        if(Math.abs(simState.riverRate) > 0.05){
            simState.riverRate *= 0.995; // Slow decay
        }
        
        // Weather influence on river rate (realistic correlation)
        const rainLevel = window.sensorData[0].value;
        if(rainLevel > 40){
            simState.riverRate += 0.001 * deltaTime * (rainLevel / 20);
        } else if(rainLevel < 10 && simState.riverLevel > 2){
            simState.riverRate -= 0.0005 * deltaTime;
        }
        
        // Update sensor 2 (river) and gauge together - ALWAYS SYNCED
        window.sensorData[1].value = simState.riverLevel;
        window.updateRiverGauge(simState.riverLevel);
        
        // Realistic rain variation (follows patterns)
        const rainVariation = (Math.sin(simState.time / 30) * 5 + (Math.random() - 0.5) * 3) * deltaTime * 0.1;
        window.sensorData[0].value = Math.max(0, Math.min(100, window.sensorData[0].value + rainVariation));
        
        // Wind follows rain patterns (correlation)
        const windTarget = 10 + (window.sensorData[0].value / 100) * 40;
        window.sensorData[2].value += (windTarget - window.sensorData[2].value) * 0.05 * deltaTime;
        window.sensorData[2].value = Math.max(0, Math.min(120, window.sensorData[2].value));
        
        // Weather status follows river level
        if(simState.riverLevel >= 5){
            window.sensorData[3].value = 'Perigo';
        } else if(simState.riverLevel >= 4){
            window.sensorData[3].value = 'Atenção';
        } else {
            window.sensorData[3].value = 'Normal';
        }
        
        // Auto-trigger siren in danger (with small hysteresis)
        try{
            const riverDanger = (window.thresholds && window.thresholds.river && window.thresholds.river.danger) || 5.0;
            const riverHyst = Math.max(0.3, (window.thresholds && window.thresholds.river && 0.5) || 0.5);
            if(simState.riverLevel >= riverDanger && !window.audioCtx){
                window.startSiren();
                simState.alertCount++;
            } else if(simState.riverLevel < (riverDanger - riverHyst) && window.audioCtx){
                window.stopSiren();
            }

            // Composite alarm: outros alertas só tocam se os três sensores estiverem críticos
            const rain = window.sensorData[0] && Number(window.sensorData[0].value) || 0;
            const river = window.sensorData[1] && Number(window.sensorData[1].value) || 0;
            const wind = window.sensorData[2] && Number(window.sensorData[2].value) || 0;
            const rainCrit = (window.thresholds && window.thresholds.rain && window.thresholds.rain.danger) || 75;
            const windCrit = (window.thresholds && window.thresholds.wind && window.thresholds.wind.danger) || 60;
            const riverCrit = riverDanger;
            const allCritical = (rain >= rainCrit) && (river >= riverCrit) && (wind >= windCrit);
            if(allCritical){
                // Start secondary alarm (beeps) in addition to main siren
                window.startSecondaryAlarm();
                // ensure main siren on as well
                if(!window.audioCtx) { window.startSiren(); simState.alertCount++; }
            } else {
                window.stopSecondaryAlarm();
            }
        }catch(e){ /* ignore safety */ }
        
        updateDevStats();
    }
    
    // Auto-update data display
    function autoUpdateData(){
        if(!simState.active) return;
        
        window.updateSensors();
        // River gauge is already updated in runSimulationTick, no need to call again
        
        simState.updateCount++;
        simState.lastUpdate = Date.now();
        updateDevStats();
        // Update charts if available
        try{ if(typeof updateCharts === 'function') updateCharts(); }catch(e){}
    }
    
    // Update dev panel stats
    function updateDevStats(){
        const hours = Math.floor(simState.time / 3600);
        const minutes = Math.floor((simState.time % 3600) / 60);
        const seconds = Math.floor(simState.time % 60);
        
        document.getElementById('simTime').textContent = 
            String(hours).padStart(2,'0') + ':' + 
            String(minutes).padStart(2,'0') + ':' + 
            String(seconds).padStart(2,'0');
        
        document.getElementById('updateCount').textContent = simState.updateCount;
        document.getElementById('alertCount').textContent = simState.alertCount;
        document.getElementById('devRiverLevel').textContent = simState.riverLevel.toFixed(2) + 'm';
        document.getElementById('riverRateValue').textContent = (simState.riverRate >= 0 ? '+' : '') + simState.riverRate.toFixed(2) + ' m/h';
    }
    
    // River Level Manual Control
    const riverLevelSlider = document.getElementById('riverLevelSlider');
    const riverLevelFill = document.getElementById('riverLevelFill');
    
    riverLevelSlider.addEventListener('input', (e)=>{
        const level = parseFloat(e.target.value);
        simState.riverLevel = level;
        riverLevelFill.style.width = ((level - 1) / 5 * 100) + '%';
        
        // Update gauge and sensor together
        window.updateRiverGauge(level);
        window.sensorData[1].value = level;
        window.updateSensors();
        updateDevStats();
    });
    
    // River Rate Control
    const riverRate = document.getElementById('riverRate');
    const riverRateFill = document.getElementById('riverRateFill');
    
    riverRate.addEventListener('input', (e)=>{
        const rate = parseFloat(e.target.value);
        simState.riverRate = rate;
        riverRateFill.style.width = ((rate + 5) / 10 * 100) + '%';
        document.getElementById('riverRateValue').textContent = (rate >= 0 ? '+' : '') + rate.toFixed(1) + ' m/h';
    });
    
    // River preset buttons
    document.getElementById('riverNormal').addEventListener('click', ()=>{ riverLevelSlider.value = 3; riverLevelSlider.dispatchEvent(new Event('input')); });
    document.getElementById('riverWarning').addEventListener('click', ()=>{ riverLevelSlider.value = 4; riverLevelSlider.dispatchEvent(new Event('input')); });
    document.getElementById('riverDanger').addEventListener('click', ()=>{ riverLevelSlider.value = 5; riverLevelSlider.dispatchEvent(new Event('input')); });
    document.getElementById('riverCritical').addEventListener('click', ()=>{ riverLevelSlider.value = 6; riverLevelSlider.dispatchEvent(new Event('input')); });
    
    // Siren Controls
    document.getElementById('sirenTrigger').addEventListener('click', ()=>{ window.startSiren(); simState.alertCount++; updateDevStats(); });
    document.getElementById('sirenStop').addEventListener('click', window.stopSiren);
    document.getElementById('sirenTest').addEventListener('click', ()=>{ 
        window.startSiren(); 
        setTimeout(window.stopSiren, 3000); 
    });
    
    // Auto-update interval control
    const updateInterval = document.getElementById('updateInterval');
    const updateIntervalFill = document.getElementById('updateIntervalFill');
    const updateIntervalValue = document.getElementById('updateIntervalValue');
    const autoUpdateStatus = document.getElementById('autoUpdateStatus');
    
    updateInterval.addEventListener('input', (e)=>{
        const interval = parseInt(e.target.value) * 1000;
        simState.autoUpdateInterval = interval;
        updateIntervalFill.style.width = ((parseInt(e.target.value) - 1) / 29 * 100) + '%';
        updateIntervalValue.textContent = (interval / 1000) + 's';
        autoUpdateStatus.textContent = 'Ativo (' + (interval / 1000) + 's)';
        
        // Restart timer with new interval
        if(autoUpdateTimer){
            clearInterval(autoUpdateTimer);
            autoUpdateTimer = setInterval(autoUpdateData, interval);
        }
    });
    
    document.getElementById('forceRefresh').addEventListener('click', autoUpdateData);
    
    // Sensor manual control (global function)
    window.setSensorState = function(index, state){
        const sensor = window.sensorData[index];
        if(state === 'normal'){
            if(sensor.type === 'rain') sensor.value = 10;
            else if(sensor.type === 'river') sensor.value = 2.5;
            else if(sensor.type === 'wind') sensor.value = 15;
            else sensor.value = 'Normal';
        } else if(state === 'warn'){
            if(sensor.type === 'rain') sensor.value = 35;
            else if(sensor.type === 'river') sensor.value = 4.0;
            else if(sensor.type === 'wind') sensor.value = 50;
            else sensor.value = 'Atenção';
        } else if(state === 'danger'){
            if(sensor.type === 'rain') sensor.value = 75;
            else if(sensor.type === 'river') sensor.value = 5.3;
            else if(sensor.type === 'wind') sensor.value = 95;
            else sensor.value = 'Perigo';
        }
        
        // Sync river gauge with sensor 2
        if(index === 1){
            simState.riverLevel = sensor.value;
            window.updateRiverGauge(sensor.value);
        }
        
        window.updateSensors();
        updateDevDisplays();
    };
    
    // Update dev panel sensor displays
    function updateDevDisplays(){
        document.getElementById('sensor1Value').textContent = window.sensorData[0].value.toFixed(1) + ' mm/h';
        document.getElementById('sensor2Value').textContent = window.sensorData[1].value.toFixed(1) + ' m';
        document.getElementById('sensor3Value').textContent = window.sensorData[2].value.toFixed(1) + ' km/h';
        document.getElementById('sensor4Value').textContent = window.sensorData[3].value;
    }
    
    // Start simulation on load
    // Inicializar gráficos (Chart.js) — se disponível
    let rainChart, windChart, riverChart;
    function initCharts(){
        try{
            const ctxR = document.getElementById('chartRain');
            const ctxW = document.getElementById('chartWind');
            const ctxV = document.getElementById('chartRiver');
            console.log('initCharts: elements', !!ctxR, !!ctxW, !!ctxV, 'Chart', typeof Chart);
            if(typeof Chart === 'undefined'){
                console.warn('Chart.js não encontrado. Verifique se o CDN carregou antes de `main.js`.');
                // show small fallback notice in the graphs area if possible
                try{
                    const el = document.getElementById('graficos');
                    if(el && !el.querySelector('.chart-fallback')){
                        const note = document.createElement('div');
                        note.className = 'chart-fallback muted';
                        note.style.marginTop = '8px';
                        note.textContent = 'Gráficos indisponíveis: Chart.js não carregado.';
                        el.appendChild(note);
                    }
                }catch(e){}
                return;
            }
            if(!ctxR || !ctxW || !ctxV){
                console.warn('initCharts: canvas elements não encontrados');
                return;
            }

            const commonOpts = {
                animation: false,
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: { legend: { display: true, position: 'top', labels:{boxWidth:12} }, tooltip: {enabled:true} },
                // hide x-axis labels (show only on hover via tooltip)
                scales: { x: { display: false } }
            };

            // seed history with small jitter to avoid flat initial line
            const now = Date.now();
            const seedCount = window.sensorHistory.maxLen;
            window.sensorHistory.timestamps = [];
            window.sensorHistory.rain = [];
            window.sensorHistory.wind = [];
            window.sensorHistory.river = [];
            for(let i = seedCount - 1; i >= 0; i--){
                const ts = new Date(now - i * 1000);
                window.sensorHistory.timestamps.push(ts.toLocaleTimeString());
                // small jitter
                window.sensorHistory.rain.push(Number((window.sensorData[0].value + (Math.random()-0.5)*3).toFixed(1)));
                window.sensorHistory.wind.push(Number((window.sensorData[2].value + (Math.random()-0.5)*4).toFixed(1)));
                window.sensorHistory.river.push(Number((window.sensorData[1].value + (Math.random()-0.5)*0.05).toFixed(2)));
            }

            rainChart = new Chart(ctxR.getContext('2d'), {
                type: 'line',
                data: { labels: window.sensorHistory.timestamps.slice(), datasets:[{label:'Pluviometria (mm/h)',data: window.sensorHistory.rain.slice(), borderColor:'#60a5fa', backgroundColor:'rgba(96,165,250,0.12)', tension:0.2, pointRadius:2}] },
                options: {...commonOpts, scales:{...commonOpts.scales, y:{min:0, max:100, title:{display:true,text:'mm/h'}}}, layout:{padding:10}}
            });

            windChart = new Chart(ctxW.getContext('2d'), {
                type: 'line',
                data: { labels: window.sensorHistory.timestamps.slice(), datasets:[{label:'Vento (km/h)',data: window.sensorHistory.wind.slice(), borderColor:'#fb923c', backgroundColor:'rgba(251,146,60,0.12)', tension:0.2, pointRadius:2}] },
                options: {...commonOpts, scales:{...commonOpts.scales, y:{min:0, max:100, title:{display:true,text:'km/h'}}}, layout:{padding:10}}
            });

            riverChart = new Chart(ctxV.getContext('2d'), {
                type: 'line',
                data: { labels: window.sensorHistory.timestamps.slice(), datasets:[{label:'Nível do Rio (m)',data: window.sensorHistory.river.slice(), borderColor:'#34d399', backgroundColor:'rgba(52,211,153,0.12)', tension:0.2, pointRadius:2}] },
                options: {...commonOpts, scales:{...commonOpts.scales, y:{min:0, max:10, title:{display:true,text:'m'}}}, layout:{padding:10}}
            });
        }catch(e){ console.warn('Chart init failed', e); }
    }

    function updateCharts(){
        try{
            // push new sample into history (timestamp + values)
            const ts = new Date().toLocaleTimeString();
            const rainVal = Number(window.sensorData[0].value.toFixed(1));
            const windVal = Number(window.sensorData[2].value.toFixed(1));
            const riverVal = Number(window.sensorData[1].value.toFixed(2));

            window.sensorHistory.timestamps.push(ts);
            window.sensorHistory.rain.push(rainVal);
            window.sensorHistory.wind.push(windVal);
            window.sensorHistory.river.push(riverVal);

            // respect selected history length
            try{
                const sel = document.getElementById('historyLen');
                const max = sel ? parseInt(sel.value,10) : window.sensorHistory.maxLen;
                window.sensorHistory.maxLen = max;
            }catch(e){}

            while(window.sensorHistory.timestamps.length > window.sensorHistory.maxLen){ window.sensorHistory.timestamps.shift(); }
            while(window.sensorHistory.rain.length > window.sensorHistory.maxLen){ window.sensorHistory.rain.shift(); }
            while(window.sensorHistory.wind.length > window.sensorHistory.maxLen){ window.sensorHistory.wind.shift(); }
            while(window.sensorHistory.river.length > window.sensorHistory.maxLen){ window.sensorHistory.river.shift(); }

            if(rainChart){ rainChart.data.labels = window.sensorHistory.timestamps.slice(); rainChart.data.datasets[0].data = window.sensorHistory.rain.slice(); rainChart.update('none'); }
            if(windChart){ windChart.data.labels = window.sensorHistory.timestamps.slice(); windChart.data.datasets[0].data = window.sensorHistory.wind.slice(); windChart.update('none'); }
            if(riverChart){ riverChart.data.labels = window.sensorHistory.timestamps.slice(); riverChart.data.datasets[0].data = window.sensorHistory.river.slice(); riverChart.update('none'); }
        }catch(e){/* ignore chart update errors */}
    }

    // Export history as CSV
    function exportCsv(){
        const rows = [];
        rows.push(['time','rain_mm_h','wind_km_h','river_m'].join(','));
        for(let i=0;i<window.sensorHistory.timestamps.length;i++){
            rows.push([window.sensorHistory.timestamps[i], window.sensorHistory.rain[i], window.sensorHistory.wind[i], window.sensorHistory.river[i]].join(','));
        }
        const csv = rows.join('\n');
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sensor_history.csv';
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
    }

    // wire export button
    try{ document.getElementById('exportCsv').addEventListener('click', exportCsv); }catch(e){}
    // history length control: apply immediately and update charts
    try{ document.getElementById('historyLen').addEventListener('change', ()=>{
        const val = parseInt(document.getElementById('historyLen').value,10);
        window.sensorHistory.maxLen = val;
        // trim existing arrays if larger than new max
        while(window.sensorHistory.timestamps.length > val) window.sensorHistory.timestamps.shift();
        while(window.sensorHistory.rain.length > val) window.sensorHistory.rain.shift();
        while(window.sensorHistory.wind.length > val) window.sensorHistory.wind.shift();
        while(window.sensorHistory.river.length > val) window.sensorHistory.river.shift();
        try{ updateCharts(); }catch(e){}
    }); }catch(e){}

    // Attempt to initialize charts now and again on load (helps if Chart.js loads slowly)
    try{ initCharts(); }catch(e){ console.warn('initCharts initial call failed', e); }
    window.addEventListener('load', function(){
        try{
            if(typeof Chart !== 'undefined') initCharts();
            else console.warn('Chart.js still undefined on window.load');
        }catch(e){ console.warn('initCharts on load failed', e); }
    });
    startSimulation();
    updateDevStats();
    updateDevDisplays();

    // Periodic dev display update
    setInterval(updateDevDisplays, 2000);
    } // Close initDevPanel function
    
    // Call init function when DOM is ready
    if(document.readyState === 'loading'){
        document.addEventListener('DOMContentLoaded', initDevPanel);
    } else {
        // DOM already loaded, call immediately
        setTimeout(initDevPanel, 0);
    }
})();
