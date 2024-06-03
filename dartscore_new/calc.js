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
	
	// Update calculator score display
	function updateDisplay() {
		if (score === '') {
			scoreDisplay.textContent = '';
		} else if (score === '0') {
			scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${score}<br><b>&#x25BE;</b>`;
		} else if (score === '180') {
			scoreDisplay.innerHTML = `<b>&#x25B4;</b><br>${score}<br><i>&#x25BE;</i>`;
		} else {
			scoreDisplay.innerHTML = `<i>&#x25B4;</i><br>${score}<br><i>&#x25BE;</i>`;
		}
	}
	
	// Toggle disabled buttons
	function toggleDisabled() {
		if (score === '') {
			backBtn.classList.add('disabled');
			resetBtn.classList.add('disabled');
			checkBtn.classList.add('disabled');
			scoreDisplay.classList.add('disabled');
			backBtn.disabled = true;
			resetBtn.disabled = true;
			checkBtn.disabled = true;
			scoreDisplay.disabled = true;
		} else {
			backBtn.classList.remove('disabled');
			resetBtn.classList.remove('disabled');
			checkBtn.classList.remove('disabled');
			scoreDisplay.classList.remove('disabled');
			backBtn.disabled = false;
			resetBtn.disabled = false;
			checkBtn.disabled = false;
			scoreDisplay.disabled = false;
		}
	}

	// Add to score
	function addScore(i) {
		if (score === '0') score = '';
		var newScore = score + i;
		if (newScore <= 180 && newScore != '00') score = newScore;
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
				if (span.classList.contains('single')) {
					total += parseInt(span.textContent);
				} else {
					total += parseInt(span.innerHTML.split('<br>')[1]);
				}
			}
		});
		if (total === 0) {
			dartsClear.textContent = 'Darts';
			dartsTotal.textContent = '';
		} else {
			dartsClear.textContent = 'Clear';
			dartsTotal.textContent = total;
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
		switch (true) {
			case (distance <= 6): sector = 50; break;
			case (distance <= 17): sector = 25; break;
			case (angle <= 9): sector = 20; break;
			case (angle <= 27): sector = 1; break;
			case (angle <= 45): sector = 18; break;
			case (angle <= 63): sector = 4; break;
			case (angle <= 81): sector = 13; break;
			case (angle <= 99): sector = 6; break;
			case (angle <= 117): sector = 10; break;
			case (angle <= 135): sector = 15; break;
			case (angle <= 153): sector = 2; break;
			case (angle <= 171): sector = 17; break;
			case (angle <= 189): sector = 3; break;
			case (angle <= 207): sector = 19; break;
			case (angle <= 225): sector = 7; break;
			case (angle <= 243): sector = 16; break;
			case (angle <= 261): sector = 8; break;
			case (angle <= 279): sector = 11; break;
			case (angle <= 297): sector = 14; break;
			case (angle <= 315): sector = 9; break;
			case (angle <= 333): sector = 12; break;
			case (angle <= 351): sector = 5; break;
			default: sector = 20;
		}

		let multiplier;
		switch (true) {
			case (distance <= 34): multiplier = 1; break;
			case (distance <= 46): multiplier = 3; break;
			case (distance <= 68): multiplier = 1; break;
			case (distance <= 83): multiplier = 2; break;
			default: multiplier = 0;
		}

		let dartDisplay = '';
		if (sector === 50) {
			dartDisplay = 'B';
		} else if (sector === 25) {
			dartDisplay = 'OB';
		} else {
			if (multiplier === 2) {
				dartDisplay = 'D';
			} else if (multiplier === 3) {
				dartDisplay = 'T';
			}
			dartDisplay += sector;
		}
		
		let dartTotal = sector * multiplier;
		if (dartTotal === 0) return;

		counted = false;
		dartSpans.forEach(span => {
			if (!counted && span.innerHTML.trim() === '') {
				if (multiplier === 1 && sector != 25 && sector != 50) {
					span.innerHTML = `<u>${dartDisplay}</u>`;
					span.classList.add('single');
				} else {
					span.innerHTML = `<u>${dartDisplay}</u><br>${dartTotal}`;
					if (multiplier === 2 || sector === 25) {
						span.classList.add('double');
					} else if (multiplier === 3 || sector === 50) {
						span.classList.add('triple');
					}
				}
				counted = true;
				updateDarts();
			}
		});

	});

});

// bull: 6%, obull: 17%