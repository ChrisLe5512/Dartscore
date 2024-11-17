document.addEventListener('DOMContentLoaded', function() {

	// GLOBAL

	const debugSpan = document.querySelector('.debug-span');

	function submitScore(score) {
		// submit score
		debugSpan.textContent = score;
		resetBtn.click();
		dartsClear.click();
	}

	// CALCULATOR

	let calcScore = '';

	// Elements
	const calcBtns = document.querySelectorAll('.calc-tbl td:not(.back-score):not(.reset-score):not(.calc-score):not(.check-score)');
	const backBtn = document.querySelector('.back-score');
	const checkBtn = document.querySelector('.check-score');
	const resetBtn = document.querySelector('.reset-score');
	const scoreDisplay = document.querySelector('.calc-score');
	
	// Update calculator score display
	function updateDisplay() {
		switch (true) {
			case (calcScore === ''): scoreDisplay.textContent = ''; break;
			case (calcScore === '0'): scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${calcScore}<br><b>&#x25BE;</b>`; break;
			case (calcScore === '180'): scoreDisplay.innerHTML = `<b>&#x25B4;</b><br>${calcScore}<br><i>&#x25BE;</i>`; break;
			default: scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${calcScore}<br><i>&#x25BE;</i>`;
		}
	}
	
	// Toggle disabled buttons
	function toggleDisabled() {
		if (calcScore === '') {
			[backBtn, resetBtn, checkBtn, scoreDisplay].forEach(button => {
				button.classList.add('disabled');
				button.disabled = true;
			});
		} else {
			[backBtn, resetBtn, checkBtn, scoreDisplay].forEach(button => {
				button.classList.remove('disabled');
				button.disabled = false;
			});1
		}
	}

	// Append to calcScore
	function addScore(i) {
		if (!calcScore) calcScore = '';
		let newScore = String(parseInt(calcScore + i));
		if (newScore <= 180) calcScore = newScore;
		updateDisplay();
		toggleDisabled();
	}

	// Increment calcScore
	function incScore(inc) {
		var newScore = String(parseInt(calcScore) + inc);
		if (newScore >= 0 && newScore <= 180) calcScore = newScore;
		updateDisplay();
		toggleDisabled();
	}

	// calcBtns click events
	calcBtns.forEach(button => {
		button.addEventListener('click', function() {
			addScore(parseInt(button.textContent.trim()));
		});
	});

	// backBtn click event
	backBtn.addEventListener('click', function() {
		calcScore = calcScore.slice(0, -1);
		updateDisplay();
		toggleDisabled();
	});

	// checkBtn click event
	checkBtn.addEventListener('click', function() {
		submitScore(parseInt(calcScore));
	});

	// resetBtn click event
	resetBtn.addEventListener('click', function() {
		calcScore = '';
		updateDisplay();
		toggleDisabled();
	});

	// scoreDisplay click event
	scoreDisplay.addEventListener('click', function(event) {
		const rect = scoreDisplay.getBoundingClientRect();
		const btnHeight = rect.height;
		const btnTop = rect.top;
		const clickY = event.clientY;
		if (clickY < (btnTop + (btnHeight / 2))) incScore(1); else incScore(-1);
	});

	// DARTBOARD

	const [dartsBust, dartsDone] = document.querySelectorAll('.large-btn');
	const dartSpans = document.querySelectorAll('.darts span');
	const dartsClear = document.querySelector('.darts-clear');
	const dartsTotal = document.querySelector('.darts-total');
	const dbSec = document.querySelector('.dartboard-section');

	// dartsBust click event
	dartsBust.addEventListener('click', function() {
		submitScore(0);
	});

	// dartsDone click event
	dartsDone.addEventListener('click', function() {
		submitScore(parseInt(dartsTotal.textContent));
		dartsClear.click();
		updateDarts();
	});

	function updateDarts() {
		let total = 0;
		dartSpans.forEach(span => {
			if (span.innerHTML.trim() != '') {
				if (span.innerHTML.trim().includes('<br>')) {
					total += parseInt(span.innerHTML.split('<br>')[1]);
				} else {
					total += parseInt(span.innerHTML.split('<u>')[1]);
				}
			}
		});
		if (!(Array.from(dartSpans).some(span => span.textContent.trim() !== ''))) {
			dartsClear.textContent = 'Darts';
			dartsClear.classList.add('disabled');
			dartsTotal.textContent = '';
			dartsTotal.classList.add('disabled');
			dartsDone.classList.add('disabled');
		} else {
			dartsClear.textContent = 'Clear';
			dartsClear.classList.remove('disabled');
			dartsTotal.textContent = total;
			dartsTotal.classList.remove('disabled');
			dartsDone.classList.remove('disabled');
		}
	}

	// dartsClear click event
	dartsClear.addEventListener('click', function() {
		dartSpans.forEach(span => {
			span.innerHTML = '';
			span.classList = '';
		});
		updateDarts();
	});

	// dartSpans click events
	dartSpans.forEach(span => {
		span.addEventListener('click', function() {
			this.innerHTML = '';
			let spanIndex = Array.from(dartSpans).indexOf(this);
			for (let i = spanIndex; i < 2; i++) {
				dartSpans[i].innerHTML = dartSpans[i + 1].innerHTML;
				dartSpans[i].classList = dartSpans[i + 1].classList;
			}
			dartSpans[2].innerHTML = '';
			dartSpans[2].classList = '';
			updateDarts();
		});
	});

	// dbSec click event
	dbSec.addEventListener('click', function(event) {
		if (event.target === this) {
			let counted = false;
			dartSpans.forEach(span => {
				if (!counted && span.innerHTML.trim() === '') {
					span.innerHTML = `<u>0</u>`;
					span.classList.add('zero');
					counted = true;
					updateDarts();
				}
			});

			debugSpan.textContent = `${dartDisplay}: ${sector}x${multiplier}=${dartTotal} (${color})`;
		}
	});

	// Dartboard click event
	document.getElementById('dartboard').addEventListener('click', function(event) {
		const rect = this.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const clickX = event.clientX - centerX;
		const clickY = event.clientY - centerY;
		
		const distance = Math.round(Math.sqrt(clickX * clickX + clickY * clickY) / (rect.width / 2) * 100);
		const angle = (Math.round(Math.atan2(clickY, clickX) * (180 / Math.PI)) + 450) % 360;

		let sector;
		let color;
		switch (true) {
			case (distance <= 6): sector = 50; color = 'black'; break;
			case (distance <= 17): sector = 25; color = 'white'; break;
			case (angle <= 9): sector = 20; color = 'black'; break;
			case (angle <= 27): sector = 1; color = 'white'; break;
			case (angle <= 45): sector = 18; color = 'black'; break;
			case (angle <= 63): sector = 4; color = 'white'; break;
			case (angle <= 81): sector = 13; color = 'black'; break;
			case (angle <= 99): sector = 6; color = 'white'; break;
			case (angle <= 117): sector = 10; color = 'black'; break;
			case (angle <= 135): sector = 15; color = 'white'; break;
			case (angle <= 153): sector = 2; color = 'black'; break;
			case (angle <= 171): sector = 17; color = 'white'; break;
			case (angle <= 189): sector = 3; color = 'black'; break;
			case (angle <= 207): sector = 19; color = 'white'; break;
			case (angle <= 225): sector = 7; color = 'black'; break;
			case (angle <= 243): sector = 16; color = 'white'; break;
			case (angle <= 261): sector = 8; color = 'black'; break;
			case (angle <= 279): sector = 11; color = 'white'; break;
			case (angle <= 297): sector = 14; color = 'black'; break;
			case (angle <= 315): sector = 9; color = 'white'; break;
			case (angle <= 333): sector = 12; color = 'black'; break;
			case (angle <= 351): sector = 5; color = 'white'; break;
			default: sector = 20; color = 'black';
		}

		let multiplier;
		switch (true) {
			case (distance <= 34): multiplier = 1; break;
			case (distance <= 46): multiplier = 3; break;
			case (distance <= 68): multiplier = 1; break;
			case (distance <= 83): multiplier = 2; break;
			default: multiplier = 0; color = 'zero';
		}

		let dartDisplay = '';
		if (sector <= 20) {
			if (multiplier === 2) dartDisplay = 'D';
			else if (multiplier === 3) dartDisplay = 'T';
			if (multiplier) dartDisplay += sector;
			else dartDisplay = '0';
		} else if (sector === 25) {
			dartDisplay = 'OB';
		} else {
			dartDisplay = 'B';
		}
		
		let dartTotal = sector * multiplier;

		let counted = false;
		dartSpans.forEach(span => {
			if (!counted && span.innerHTML.trim() === '') {
				span.innerHTML = `<u>${dartDisplay}</u>`;
				if (multiplier > 1 || sector > 20) {
					span.innerHTML += `<br>${dartTotal}`;
					if (color === 'black') color = 'red';
					else color = 'green';
				}
				span.classList.add(color);
				counted = true;
				updateDarts();
			}
		});

		debugSpan.textContent = `${dartDisplay}: ${sector}x${multiplier}=${dartTotal} (${color})`;

	});

});

// bull: 6%, obull: 17%