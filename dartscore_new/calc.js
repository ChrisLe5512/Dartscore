document.addEventListener('DOMContentLoaded', function() {
	// Get buttons
	const calcBtns = document.querySelectorAll('.calc-tbl td:not(.back-score):not(.reset-score):not(.calc-score):not(.check-score)');
	const backBtn = document.querySelector('.back-score');
	const checkBtn = document.querySelector('.check-score');
	const resetBtn = document.querySelector('.reset-score');

	// Get score display
	const scoreDisplay = document.querySelector('.calc-score');

	// Initialize score variable
	let score = '';
	
	// Function to update display
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
	
	// Function to toggle disabled class based on score value
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

	// Function to update score
	function addScore(i) {
		if (score === '0') score = '';
		let newScore = score + i;
		if (newScore <= 180 && newScore != '00') score = newScore;
		updateDisplay();
		toggleDisabled();
	}

	// Function to increment score
	function incScore(inc) {
		let newScore = String(parseInt(score) + inc);
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
		if (!checkBtn.disabled) return;
		// add score to player
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

});