document.addEventListener('DOMContentLoaded', function() {

	// GLOBAL

	let score = '';

	function submitScore(score) {
		// submit score
	}

	// CALCULATOR

	// Elements
	const calcBtns = document.querySelectorAll('.calc-tbl td:not(.back-score):not(.reset-score):not(.calc-score):not(.check-score)');
	const backBtn = document.querySelector('.back-score');
	const checkBtn = document.querySelector('.check-score');
	const resetBtn = document.querySelector('.reset-score');
	const scoreDisplay = document.querySelector('.calc-score');
	const testSpan = document.querySelector('.test');
	
	// Update calculator score display
	function updateDisplay() {
		switch (true) {
			case (score === ''): scoreDisplay.textContent = ''; break;
			case (score === '0'): scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${score}<br><b>&#x25BE;</b>`; break;
			case (score === '180'): scoreDisplay.innerHTML = `<b>&#x25B4;</b><br>${score}<br><i>&#x25BE;</i>`; break;
			default: scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${score}<br><i>&#x25BE;</i>`;
		}
	}
	
	// Toggle disabled buttons
	function toggleDisabled() {
		if (score === '') {
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

	// Add to score
	function addScore(i) {
		if (!score) score = '';
		let newScore = String(parseInt(score + i));
		testSpan.innerHTML = newScore;
		if (newScore <= 180) score = newScore;
		updateDisplay();
		toggleDisabled();
	}

	// Increment score
	function incScore(inc) {
		var newScore = String(parseInt(score) + inc);
		if (newScore >= 0 && newScore <= 180) score = newScore;
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
		if (backBtn.disabled) return;
		score = score.slice(0, -1);
		updateDisplay();
		toggleDisabled();
	});

	// checkBtn click event
	checkBtn.addEventListener('click', function() {
		if (checkBtn.disabled) return;
		submitScore(score);
		score = '';
		updateDisplay();
		toggleDisabled();
	});

	// resetBtn click event
	resetBtn.addEventListener('click', function() {
		if (resetBtn.disabled) return;
		score = '';
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

	const dartSpans = document.querySelectorAll('.darts span');
	const dartsClear = document.querySelector('.darts-clear');
	const dartsTotal = document.querySelector('.darts-total');

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
		} else {
			dartsClear.textContent = 'Clear';
			dartsClear.classList.remove('disabled');
			dartsTotal.textContent = total;
			dartsTotal.classList.remove('disabled');
		}
	}

	dartsClear.addEventListener('click', function() {
		dartSpans.forEach(span => {
			span.innerHTML = '';
			span.classList = '';
		});
		updateDarts();
	});


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

		testSpan.textContent = `s${sector} ${color} x${multiplier} d${dartDisplay} t${dartTotal}`;

		counted = false;
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

	});

});

// bull: 6%, obull: 17%