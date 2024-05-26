document.addEventListener('DOMContentLoaded', function() {
    // Get buttons
    const calcBtns = document.querySelectorAll('.calc-tbl td:not(.back-score):not(.reset-score):not(.calc-score)');
    const backBtn = document.querySelector('.back-score');
    const resetBtn = document.querySelector('.reset-score');
    const checkBtn = document.querySelector('.check-score');

    // Get score display
    const scoreBtn = document.querySelector('.calc-score');

    // Initialize score variable
    let calcScore = '';

    // calcBtns click events
    calcBtns.forEach(button => {
        button.addEventListener('click', function() {
            let newScore = calcScore + button.textContent.trim();
            if (newScore <= 180) calcScore = newScore;
            scoreBtn.textContent = calcScore;
        });
    });

    // backBtn click event
    backBtn.addEventListener('click', function() {
        calcScore = calcScore.slice(0, -1);
        scoreBtn.textContent = calcScore;
    });

    // resetBtn click event
    resetBtn.addEventListener('click', function() {
        calcScore = '';
        scoreBtn.textContent = calcScore;
    });

    // checkBtn click event
    checkBtn.addEventListener('click', function() {
        // add score to player
    });

});