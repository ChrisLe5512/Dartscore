document.addEventListener('DOMContentLoaded', function() {
	
	// Save data on any update
	document.addEventListener('click', saveData);
	document.addEventListener('keydown', saveData);

	// GLOBAL

	const debugSpan = document.querySelector('.debug-span');

	let playerWins = [];
	let playerNames = [];
	let playerScores = [];
	let playerHistory = [];
	let playerCheckout = [];
	let activePlayer = 0;
	let startScore = 301;
	let legCount = 2;
	let setCount = 2;

	function saveData() {
		const data = {
			playerWins,
			playerNames,
			playerScores,
			playerHistory,
			playerCheckout,
			activePlayer,
			startScore,
			legCount,
			setCount,
		};
		localStorage.setItem('dartGameData', JSON.stringify(data));
	}
	
	function loadData() {
		const data = JSON.parse(localStorage.getItem('dartGameData'));
		console.log(data);
		if (data) {
			playerWins = data.playerWins;
			playerNames = data.playerNames;
			playerScores = data.playerScores;
			playerHistory = data.playerHistory;
			playerCheckout = data.playerCheckout;
			activePlayer = data.activePlayer;
			startScore = data.startScore;
			legCount = data.legCount;
			setCount = data.setCount;

			addPlayer();

			for (let i = 0; i < playerNames.length; i++) {
				addPlayer(playerWins[i], playerNames[i], playerScores[i], playerHistory[i], playerCheckout[i]);
			}
			// playerCheckout.forEach((checkout, idx) => {
			// 	const checkoutCell = historyRows[idx].querySelector('.checkout');
			// 	if (checkout) {
			// 		checkoutCell.classList.remove('hidden');
			// 		checkoutCell.innerHTML = checkout;
			// 	} else {
			// 		checkoutCell.classList.add('hidden');
			// 	}
			// });
			// cyclePlayers(activePlayer);
		}
	}

	// loadData();

	function updatePlayers() {
		playerWins = Array.from(document.querySelectorAll('.player-wins')).map(win => [0, 0]);
		playerNames = Array.from(document.querySelectorAll('.player-name input')).map(input => input.value);
		playerScores = Array.from(document.querySelectorAll('.player-score')).map(score => startScore);
		playerHistory = Array.from(document.querySelectorAll('.history')).map(history => []);
		playerCheckout = Array.from(document.querySelectorAll('.checkout')).map(checkout => '');
	}

	// Add player click event
	document.querySelector('.add-player').addEventListener('click', function() {
		addPlayer();
	});

	function addPlayer(wins = [0, 0], name = `Player ${playerNames.length + 1}`, score = startScore, history = [], checkout = '') {
		let playerRow = document.createElement('tr');
		playerRow.classList.add('player-row');
		playerRow.innerHTML = `
			<td class="player-wins"><u>${wins[0]}&#8196;&#8196;</u><br>${wins[1]}</td>
			<td class="target-wins">&nbsp;/${legCount}<br>&nbsp;/${setCount}</td>
			<td colspan="4" class="player-name"><input type="text" value="${name}"></td>
			<td class="player-score">${score}</td>
		`;
		let historyRow = document.createElement('tr');
		historyRow.classList.add('history-row');
		historyRow.innerHTML = `
			<td colspan="7" class="history scrollable">${history}</td>
			<td colspan="2" class="checkout hidden">${checkout}</td>
		`;
		const scoresTblBody = document.querySelector('.scores-tbl tbody');
		scoresTblBody.insertBefore(playerRow, scoresTblBody.lastElementChild);
		scoresTblBody.insertBefore(historyRow, scoresTblBody.lastElementChild);
		updatePlayers();
		if (playerNames.length === 1) cyclePlayers();
		if (playerNames.length >= 4) document.querySelector('.add-player').classList.add('hidden');
		const playerNameInput = playerRow.querySelector('.player-name input');
		playerNameInput.focus();
		playerNameInput.select();
		playerNameInput.addEventListener('keydown', function(event) {
			if (event.key === 'Enter') {
				playerNameInput.blur();
			}
		});
	}

	function submitScore(score) {

		// Update player scores
		if (score <= playerScores[activePlayer]) {
			playerScores[activePlayer] -= score;
			playerHistory[activePlayer].push(score);
			playerCheckout[activePlayer] = getCheckout(playerScores[activePlayer]);

			const playerRow = document.querySelectorAll('.player-row')[activePlayer];
			const playerScoreCell = playerRow.querySelector('.player-score');
			playerScoreCell.textContent = playerScores[activePlayer];

			const historyRow = document.querySelectorAll('.history-row')[activePlayer];
			const checkoutCell = historyRow.querySelector('.checkout');
			const historyCell = historyRow.querySelector('.history');

			if (playerCheckout[activePlayer]) {
				historyCell.setAttribute('colspan', '5');
				checkoutCell.classList.remove('hidden');
				checkoutCell.innerHTML = playerCheckout[activePlayer];
			} else {
				historyCell.setAttribute('colspan', '7');
				checkoutCell.classList.add('hidden');
			}

			const scoreSpan = document.createElement('span');
			scoreSpan.innerHTML = `<b>${score}</b>`;
			historyCell.insertBefore(scoreSpan, historyCell.firstChild);

			if (playerScores[activePlayer] === 0) {
				// playerWins[activePlayer][0]++;
				if (++playerWins[activePlayer][0] === legCount) {
					playerWins[activePlayer][0] = 0;
					// playerWins[activePlayer][1]++;
					if (++playerWins[activePlayer][1] === setCount) {
						alert(`${playerNames[activePlayer]} wins!`);
					}
				}
				resetBtn.click();
				dartsClear.click();
				resetScores();
				cyclePlayers(0);
				return;
			}
		}

		resetBtn.click();
		dartsClear.click();

		cyclePlayers();
	}

	function resetScores() {
		playerWins.forEach((wins, idx) => {
			const playerRow = document.querySelectorAll('.player-row')[idx];
			const playerWinsCell = playerRow.querySelector('.player-wins');
			let winsText = `<u>${wins[0]}&#8196;&#8196;</u><br>${wins[1]}&#8196;&#8196;`;
			playerWinsCell.innerHTML = winsText;
		});
		playerScores = Array.from({ length: playerNames.length }, () => startScore);
		// playerHistory = Array.from({ length: playerNames.length }, () => [null]);
		playerCheckout = Array.from({ length: playerNames.length }, () => '');
		document.querySelectorAll('.player-score').forEach((score, idx) => score.textContent = startScore);
		// document.querySelectorAll('.history').forEach(history => history.innerHTML = '');
		document.querySelectorAll('.checkout').forEach(checkout => checkout.innerHTML = '');
	}

	function cyclePlayers(next = activePlayer + 1) {
		activePlayer = next % playerNames.length;
		document.querySelectorAll('.player-row').forEach((row, idx) => {
			if (idx === activePlayer) row.classList.add('active');
			else row.classList.remove('active');
		});
	}

	function getCheckout(score, idx = 0) {
		// Define the scoring options
		const singles = Array.from({ length: 20 }, (_, i) => `${i + 1}`);
		const doubles = Array.from({ length: 20 }, (_, i) => `D${i + 1}`);
		const trebles = Array.from({ length: 20 }, (_, i) => `T${i + 1}`);
		const specials = ['B', 'OB'];
	
		const values = {
			B: 50,
			OB: 25,
			...Object.fromEntries(singles.map(s => [s, parseInt(s)])),
			...Object.fromEntries(doubles.map(d => [d, 2 * parseInt(d.slice(1))])),
			...Object.fromEntries(trebles.map(t => [t, 3 * parseInt(t.slice(1))]))
		};
		
		// Helper function to calculate score for a sequence
		const calculateScore = sequence => sequence.reduce((sum, dart) => sum + values[dart], 0);
	
		// Brute-force combinations
		const results = [];
		const maxDarts = score <= 60 ? 2 : 3; // Always consider 2 darts for scores <= 40
	
		// Prioritize darts: trebles first, then doubles, then singles, sorted by largest numbers
		const allDarts = [...trebles, ...doubles, ...singles, ...specials].sort((a, b) => values[b] - values[a]);
	
		// Find the minimum number of darts for the given score
		for (let darts = 1; darts <= maxDarts; darts++) {
			const recurse = (path = [], remaining = darts) => {
				const currentScore = calculateScore(path);
				if (remaining === 0) {
					// Valid if the score matches exactly and ends with a valid double or bull
					const lastDart = path[path.length - 1];
					if (currentScore === score && (lastDart.startsWith('D') || lastDart === 'B')) results.push(path);
					return;
				}
				for (const dart of allDarts) if (currentScore + values[dart] <= score) recurse([...path, dart], remaining - 1);
			};
			recurse();
		}

		if (results.length === 0) return '';
		idx %= results.length;
		return `&#127919; ${results[idx].join(' ')}`;
	}

	document.querySelector('.full-screen').addEventListener('click', toggleFullscreen);

	document.addEventListener('keydown', function (event) {
		// Detect F11 key
		if (event.key === 'F11') {
			event.preventDefault(); // Prevent the default F11 behavior (browser's native fullscreen)
			toggleFullscreen();
		}
	});

	function toggleFullscreen() {
		const doc = document.documentElement;

		if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
			// Enter fullscreen mode
			if (doc.requestFullscreen) {
				doc.requestFullscreen();
			} else if (doc.webkitRequestFullscreen) {
				doc.webkitRequestFullscreen(); // Safari compatibility
			} else if (doc.msRequestFullscreen) {
				doc.msRequestFullscreen(); // Older Microsoft browsers
			}
		} else {
			// Exit fullscreen mode
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen(); // Safari compatibility
			} else if (document.msExitFullscreen) {
				document.msExitFullscreen(); // Older Microsoft browsers
			}
		}
	}

	// checkout click event
	// checkout.addEventListener('click', function() {
	// 	checkout.innerHTML = getCheckout(globalScore, ++index);
	// });
	
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
	// const dbSec = document.querySelector('.dartboard-section');

	// dartsBust click event
	dartsBust.addEventListener('click', function() {
		if (!dartsBust.classList.contains('disabled')) submitScore(0);
	});

	// dartsDone click event
	dartsDone.addEventListener('click', function() {
		if (!dartsDone.classList.contains('disabled')) {
			submitScore(parseInt(dartsTotal.textContent));
			dartsClear.click();
			updateDarts();
		}
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
	// dbSec.addEventListener('click', function(event) {
	// 	if (event.target === this) {
	// 		let counted = false;
	// 		dartSpans.forEach(span => {
	// 			if (!counted && span.innerHTML.trim() === '') {
	// 				span.innerHTML = `<u>0</u>`;
	// 				span.classList.add('zero');
	// 				counted = true;
	// 				updateDarts();
	// 			}
	// 		});
	// 		// debugSpan.textContent = `${dartDisplay}: ${sector}x${multiplier}=${dartTotal} (${color})`;
	// 	}
	// });

	document.getElementById('dartboard').addEventListener('mousemove', function(event) {
		const rect = this.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		const clickX = event.clientX - centerX;
		const clickY = event.clientY - centerY;
		const distance = Math.round(Math.sqrt(clickX * clickX + clickY * clickY) / (rect.width / 2) * 100);
	
		// If the cursor is within the threshold distance, set the cursor to a crosshair
		if (distance <= 100) {
			this.style.cursor = 'crosshair';
		} else {
			this.style.cursor = 'default';
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

		const sectors = [50, 25, 20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
		const colors = ['zero', 'black', 'white', 'red', 'green'];
		
		let sector;
		switch (true) {
			case (distance <= 6): sector = 50; break;
			case (distance <= 17): sector = 25; break;
			default: sector = sectors[Math.floor((angle + 9) / 18) % 20 + 2];
		}

		let multiplier;
		switch (true) {
			case (distance <= 34): multiplier = 1; break;
			case (distance <= 46): multiplier = 3; break;
			case (distance <= 68): multiplier = 1; break;
			case (distance <= 83): multiplier = 2; break;
			case (distance <= 100): multiplier = 0; break;
			default: return;
		}

		let color = colors[!!multiplier + (!!multiplier * sectors.indexOf(sector)) % 2 + (multiplier > 1 || sector > 20 ? 2 : 0)];

		// debugSpan.textContent = `${sector}x${multiplier} (${color})`;

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
				if (multiplier > 1 || sector > 20) span.innerHTML += `<br>${dartTotal}`;
				span.classList.add(color);
				counted = true;
				updateDarts();
			}
		});

		// debugSpan.textContent = `${dartDisplay}: ${sector}x${multiplier}=${dartTotal} (${color})`;
		debugSpan.innerHTML = `(${parseInt(clickX)}, ${parseInt(clickY)}) ${distance}% ${angle}&deg;`;

	});

});