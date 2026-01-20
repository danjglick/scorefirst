// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
function getShim() { return (canvas?.width || window.innerWidth) / 10 }
function getBallRadius() { return (canvas?.width || window.innerWidth) / 20 }
function getTargetRadius() { return (canvas?.width || window.innerWidth) / 20 }
const FRICTION = .99
const FLING_DIVISOR = 2
const BALL_STOP_SPEED = 10 // Higher threshold so we treat the ball as "stopped" sooner
const TOUCH_TOLERANCE = 20 // Extra pixels for touch detection
const SPAWN_ANIMATION_DURATION = 700 // ms for ball spawn animation
const FADE_DURATION = 1000 // ms for fade animations
const FADE_IN_DELAY = 1000 // ms delay before starting fade-in (prevents flashing)
const TROPHY_PLACEMENT_DELAY = 2000 // ms delay before placing trophy
const TUTORIAL_FADE_DELAY = 2000 // ms delay before fading tutorial
const OBSTACLE_FADE_DELAY = 1000 // ms delay before fading obstacles
const BALL_MIN_CONTINUE_SPEED = 3 // If above this and path will clear all targets, don't auto-reset yet
const AUTO_RESET_DURATION = 1000 // ms for ball move-back + target fade-in

let canvas;
let ctx;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0,
	isBeingFlung: false,
	fadeOpacity: 1.0
}
let targets = []
let targetsRemaining = []
let obstacles = []
let star = null // White star that removes obstacles when hit (levels > 4, 20% chance)
let switcher = null // White loop symbol that switches all red and blue balls when hit (levels > 4, 20% chance)
let skull = null // White skull and crossbones that doubles obstacles when hit (levels > 4, 20% chance)
let skullHitThisTry = false // Track if skull has been hit this try (idempotent)
let trophy = null // Trophy that appears after collecting all targets
let savedTargets = [] // Saved positions for retry
let savedObstacles = [] // Saved positions for retry
let savedBall = null // Saved ball position for retry
let savedStar = null // Saved star position for retry
let savedSwitcher = null // Saved switcher position for retry
let savedSkull = null // Saved skull position for retry
let isConvertingObstacle = false
let selectedForConversion = null // { type: 'obstacle' | 'target' | 'star', index: number }
let touch1 = {
	xPos: 0,
	yPos: 0
}
// Track where the last target was collected so we can place the trophy there
let lastTargetX = null
let lastTargetY = null
// Track previous ball position so we can animate to the next level's starting spot
let previousBallX = null
let previousBallY = null
// Track whether we've already completed at least one level (so we can skip
// the spawn animation for the very first level).
let hasCompletedALevel = false
// Simple three-step tutorial for level 1
let tutorialStep = 0 // 0 = off, 1..3 = active steps
let tutorialCompleted = false
// Remember last on-screen tutorial position so follow-up levels can reuse it.
let tutorialLastX = null
let tutorialLastY = null
// For the very first level only, fade in the grey ball and score.
let initialIntroActive = true
let initialIntroStartTime = 0
// Track when a "shot" is in progress (ball has been flung this level)
let shotActive = false
// Track auto-reset animation when a shot fails (ball moves back, targets fade in)
let autoResetActive = false
let autoResetStartTime = 0
let autoResetBallFromX = 0
let autoResetBallFromY = 0
let autoResetBallToX = 0
let autoResetBallToY = 0
let tries = 0
let levelScore = 0
let totalScore = 0
let pointsThisLevel = 0 // Track points gained during current level for retry
let completionScore = 0 // Score for completing levels (clearing all targets)
let scoreIncrementDisplay = null // { opacity: 1.0, timeLeft: 1.0, amount: 1 } for showing +1 indicator
let level = 0
let gameLoopTimeout = null
let fireworks = []
let obstacleExplosionTimeout = null
let tutorialExplosionTimeout = null
let nextLevelTimeout = null
let isGeneratingLevel = false
let pendingNextLevel = false

function initializeGame() {
	canvas = document.getElementById("canvas")
	resizeCanvas()
	ctx = canvas.getContext('2d')
	
	// Start the very first level with a fade-in of the grey ball and score.
	initialIntroActive = true
	initialIntroStartTime = Date.now()
	ball.fadeOpacity = 0.0
	window.addEventListener("resize", resizeCanvas)
	document.addEventListener("touchstart", handleTouchstart)
	document.addEventListener("touchmove", handleTouchmove, { passive: false })
	document.addEventListener("touchend", handleTouchend)
	document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false })
	// Prevent zoom gestures
	document.addEventListener("gesturestart", (e) => e.preventDefault(), { passive: false })
	document.addEventListener("gesturechange", (e) => e.preventDefault(), { passive: false })
	document.addEventListener("gestureend", (e) => e.preventDefault(), { passive: false })
	generateLevel()
}

function generateLevel(isRetry = false, fewerSprites = false) {
	// Check tries before resetting - if retrying with tries > 0, restore saved positions
	let shouldRestorePositions = isRetry && !fewerSprites && tries > 0
	
	// Remember the previous ball position so we can animate into the next level's
	// starting spot — but ONLY after the first level has been completed.
	if (ball && !isRetry && hasCompletedALevel) {
		previousBallX = ball.xPos
		previousBallY = ball.yPos
	} else if (!ball) {
		previousBallX = null
		previousBallY = null
	}
	
	// If retry (normal retry or retry going to next level), remove points gained during current level
	if (isRetry || (fewerSprites && pointsThisLevel > 0)) {
		totalScore -= pointsThisLevel
	}
	if (!isRetry || fewerSprites) {
		if (!fewerSprites) {
			level++
		}
		if (fewerSprites) {
			placeTargetsWithCount(5)
			placeObstaclesWithCount(5)
		} else {
			placeTargets()
			placeObstacles()
		}
		placeBall()
		// Reset star before potentially placing a new one
		star = null
		// Spawn star on level 5 and above with 20% chance
		if (level >= 5 && Math.random() < 0.2) {
			placeStar()
		}
		// Reset switcher before potentially placing a new one
		switcher = null
		// Spawn switcher on level 5 and above with 20% chance
		if (level >= 5 && Math.random() < 0.2) {
			placeSwitcher()
		}
		// Reset skull before potentially placing a new one
		skull = null
		// Spawn skull on level 5 and above with 20% chance
		if (level >= 5 && Math.random() < 0.2) {
			placeSkull()
		}
		// Save positions after placing (for future retries)
		// Clear fade-in state from saved obstacles to prevent flashing on restore
		let obstaclesToSave = JSON.parse(JSON.stringify(obstacles))
		for (let i = 0; i < obstaclesToSave.length; i++) {
			delete obstaclesToSave[i].fadeInOpacity
			delete obstaclesToSave[i].fadeInStartTime
		}
		savedTargets = JSON.parse(JSON.stringify(targets))
		savedObstacles = obstaclesToSave
		savedBall = JSON.parse(JSON.stringify(ball))
		savedStar = star ? JSON.parse(JSON.stringify(star)) : null
		savedSwitcher = switcher ? JSON.parse(JSON.stringify(switcher)) : null
		savedSkull = skull ? JSON.parse(JSON.stringify(skull)) : null
	} else {
		// Normal retry - restore obstacles and targets for current level
		// Level stays the same, so tutorial stays the same
		if (shouldRestorePositions && savedTargets.length > 0 && savedObstacles.length > 0 && savedBall) {
			// Restore saved positions
			targets = JSON.parse(JSON.stringify(savedTargets))
			obstacles = JSON.parse(JSON.stringify(savedObstacles))
			ball = JSON.parse(JSON.stringify(savedBall))
			// Reset ball velocity
			ball.xVel = 0
			ball.yVel = 0
			ball.isBeingFlung = false
			// Reset fade-in for obstacles to prevent flashing
			for (let i = 0; i < obstacles.length; i++) {
				obstacles[i].fadeInOpacity = 0
				obstacles[i].fadeInStartTime = Date.now()
			}
		} else {
			// Generate new positions (first retry or no saved positions)
			placeTargets()
			placeObstacles()
			placeBall()
			// Reset star before potentially placing a new one
			star = null
			// Spawn star on level 5 and above with 20% chance
			if (level >= 5 && Math.random() < 0.2) {
				placeStar()
			}
			// Reset switcher before potentially placing a new one
			switcher = null
			// Spawn switcher on level 5 and above with 20% chance
			if (level >= 5 && Math.random() < 0.2) {
				placeSwitcher()
			}
			// Reset skull before potentially placing a new one
			skull = null
			// Spawn skull on level 5 and above with 20% chance
			if (level >= 5 && Math.random() < 0.2) {
				placeSkull()
			}
			// Save positions for future retries
			// Clear fade-in state from saved obstacles to prevent flashing on restore
			let obstaclesToSave = JSON.parse(JSON.stringify(obstacles))
			for (let i = 0; i < obstaclesToSave.length; i++) {
				delete obstaclesToSave[i].fadeInOpacity
				delete obstaclesToSave[i].fadeInStartTime
			}
			savedTargets = JSON.parse(JSON.stringify(targets))
			savedObstacles = obstaclesToSave
			savedBall = JSON.parse(JSON.stringify(ball))
			savedStar = star ? JSON.parse(JSON.stringify(star)) : null
			savedSwitcher = switcher ? JSON.parse(JSON.stringify(switcher)) : null
			savedSkull = skull ? JSON.parse(JSON.stringify(skull)) : null
		}
	}
	targetsRemaining = JSON.parse(JSON.stringify(targets))
	fireworks = []
	// Don't reset star here - it's placed after obstacles/ball, so reset it before placement
	trophy = null // Reset trophy for new level
	pendingNextLevel = false
	autoResetActive = false
 
	// Ensure grey ball is fully visible (no fade behavior)
	if (ball) {
		ball.fadeOpacity = 1.0
	}

	// If this is a new level AFTER the first completion (not a retry) and we know
	// where the ball was before, animate the ball moving from its previous position
	// into the new starting spot.
	if (!isRetry && hasCompletedALevel && previousBallX !== null && previousBallY !== null) {
		// Store the spawn animation state on the ball
		ball.spawnFromX = previousBallX
		ball.spawnFromY = previousBallY
		ball.spawnToX = ball.xPos
		ball.spawnToY = ball.yPos
		ball.spawnStartTime = Date.now()
		ball.isSpawningToStart = true

		// Start the ball visually at the previous location, stationary
		ball.xPos = previousBallX
		ball.yPos = previousBallY
		ball.xVel = 0
		ball.yVel = 0
		ball.isBeingFlung = false
	}
	selectedForConversion = null
	scoreIncrementDisplay = null // Reset score increment display
	// Clear any pending timeouts
	if (obstacleExplosionTimeout !== null) {
		clearTimeout(obstacleExplosionTimeout)
		obstacleExplosionTimeout = null
	}
	if (tutorialExplosionTimeout !== null) {
		clearTimeout(tutorialExplosionTimeout)
		tutorialExplosionTimeout = null
	}
	if (nextLevelTimeout !== null) {
		clearTimeout(nextLevelTimeout)
		nextLevelTimeout = null
	}
	levelScore = 0
	pointsThisLevel = 0 // Reset points gained this level
	tries = 0
	skullHitThisTry = false // Reset skull hit flag for new try
	// Initialize or clear tutorial for this level
	if (level === 1 && !tutorialCompleted) {
		// Level 1: full multi-step tutorial (fling, hit, switch)
		tutorialStep = 1
	} else if (level === 2) {
		// Level 2: single reminder about switching mechanic
		tutorialStep = 1
	} else {
		tutorialStep = 0
	}
	updateTutorial()
	if (gameLoopTimeout !== null) {
		clearTimeout(gameLoopTimeout)
		gameLoopTimeout = null
	}
	// Draw immediately so UI (level indicator) doesn't "flash" during the 100ms restart delay
	// CRITICAL: Ensure all sprites start at opacity 0 and have fade-in initialized before first draw
	// Add delay before fade-in starts to prevent flashing
	let fadeInStartTime = Date.now() + FADE_IN_DELAY
	for (let i = 0; i < obstacles.length; i++) {
		obstacles[i].fadeInOpacity = 0
		obstacles[i].fadeInStartTime = fadeInStartTime
	}
	// Ensure all targets have fade-in initialized
	for (let i = 0; i < targetsRemaining.length; i++) {
		targetsRemaining[i].fadeInOpacity = 0
		targetsRemaining[i].fadeInStartTime = fadeInStartTime
	}
	// Ensure star has fade-in initialized
	if (star) {
		star.fadeInOpacity = 0
		star.fadeInStartTime = fadeInStartTime
	}
	// Ensure switcher has fade-in initialized
	if (switcher) {
		switcher.fadeInOpacity = 0
		switcher.fadeInStartTime = fadeInStartTime
	}
	// Ensure skull has fade-in initialized
	if (skull) {
		skull.fadeInOpacity = 0
		skull.fadeInStartTime = fadeInStartTime
	}
	draw()
	// Small delay to prevent zoom issues during level reload, then resume
	setTimeout(() => {
		isGeneratingLevel = false
		loopGame()
	}, 100)
}

function loopGame() { // MAIN GAME LOOP
	moveBall()
	handleCollision()
	draw()
	gameLoopTimeout = setTimeout(loopGame, MS_PER_FRAME)
}

function convertTargetAndObstacle(targetIndex, obstacleIndex) {
	let target = targetsRemaining[targetIndex]
	let obstacle = obstacles[obstacleIndex]
	let targetRadius = getTargetRadius()
	
	// Save positions
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Remove both from their arrays
	obstacles.splice(obstacleIndex, 1)
	targetsRemaining.splice(targetIndex, 1)
	
	// Convert obstacle to target (at obstacle's position)
	targetsRemaining.push({
		xPos: obstacleX,
		yPos: obstacleY,
		fadeInOpacity: 1.0, // Instantly visible
		fadeInStartTime: Date.now() // Already started
	})
	
	// Convert target to obstacle (at target's position)
	obstacles.push({
		xPos: targetX,
		yPos: targetY,
		radius: targetRadius,
		fadeInOpacity: 1.0, // Instantly visible
		fadeInStartTime: Date.now() // Already started
	})
	
	selectedForConversion = null
	isConvertingObstacle = true
}

function swapStarAndTarget(targetIndex) {
	if (!star) return
	
	let starX = star.xPos
	let starY = star.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array - try to match by finding the target
	// that was at this position before any swaps occurred
	// Since targetsRemaining is created from targets, we can find by matching all targets
	// that haven't been collected yet
	let targetInTargets = null
	// First, try to find by exact position match
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		// Check if this target is still in targetsRemaining (not collected)
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		// If this target matches the one we're swapping with and is still remaining
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions
	star.xPos = targetX
	star.yPos = targetY
	target.xPos = starX
	target.yPos = starY
	if (targetInTargets) {
		targetInTargets.xPos = starX
		targetInTargets.yPos = starY
	}
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapStarAndObstacle(obstacleIndex) {
	if (!star) return
	
	let starX = star.xPos
	let starY = star.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions
	star.xPos = obstacleX
	star.yPos = obstacleY
	obstacle.xPos = starX
	obstacle.yPos = starY
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapSkullAndTarget(targetIndex) {
	if (!skull) return
	
	let skullX = skull.xPos
	let skullY = skull.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array - try to match by finding the target
	// that was at this position before any swaps occurred
	let targetInTargets = null
	// First, try to find by exact position match among remaining targets
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		// Check if this target is still in targetsRemaining (not collected)
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		// If this target matches the one we're swapping with and is still remaining
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions
	skull.xPos = targetX
	skull.yPos = targetY
	target.xPos = skullX
	target.yPos = skullY
	if (targetInTargets) {
		targetInTargets.xPos = skullX
		targetInTargets.yPos = skullY
	}
	
	// Ensure items are instantly visible
	skull.fadeInOpacity = 1.0
	skull.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapSkullAndObstacle(obstacleIndex) {
	if (!skull) return
	
	let skullX = skull.xPos
	let skullY = skull.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions
	skull.xPos = obstacleX
	skull.yPos = obstacleY
	obstacle.xPos = skullX
	obstacle.yPos = skullY
	
	// Ensure items are instantly visible
	skull.fadeInOpacity = 1.0
	skull.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapStarAndSkull() {
	if (!star || !skull) return
	
	let starX = star.xPos
	let starY = star.yPos
	let skullX = skull.xPos
	let skullY = skull.yPos
	
	// Swap positions
	star.xPos = skullX
	star.yPos = skullY
	skull.xPos = starX
	skull.yPos = starY
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	skull.fadeInOpacity = 1.0
	skull.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapStarAndSwitcher() {
	if (!star || !switcher) return
	
	let starX = star.xPos
	let starY = star.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions
	star.xPos = switcherX
	star.yPos = switcherY
	switcher.xPos = starX
	switcher.yPos = starY
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapSkullAndSwitcher() {
	if (!skull || !switcher) return
	
	let skullX = skull.xPos
	let skullY = skull.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions
	skull.xPos = switcherX
	skull.yPos = switcherY
	switcher.xPos = skullX
	switcher.yPos = skullY
	
	// Ensure items are instantly visible
	skull.fadeInOpacity = 1.0
	skull.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapSwitcherAndTarget(targetIndex) {
	if (!switcher) return
	
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array - try to match by finding the target
	// that was at this position before any swaps occurred
	let targetInTargets = null
	// First, try to find by exact position match among remaining targets
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		// Check if this target is still in targetsRemaining (not collected)
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		// If this target matches the one we're swapping with and is still remaining
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions
	switcher.xPos = targetX
	switcher.yPos = targetY
	target.xPos = switcherX
	target.yPos = switcherY
	if (targetInTargets) {
		targetInTargets.xPos = switcherX
		targetInTargets.yPos = switcherY
	}
	
	// Ensure items are instantly visible
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapSwitcherAndObstacle(obstacleIndex) {
	if (!switcher) return
	
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions
	switcher.xPos = obstacleX
	switcher.yPos = obstacleY
	obstacle.xPos = switcherX
	obstacle.yPos = switcherY
	
	// Ensure items are instantly visible
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBallAndTarget(targetIndex) {
	let ballX = ball.xPos
	let ballY = ball.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array - try to match by finding the target
	// that was at this position before any swaps occurred
	let targetInTargets = null
	// First, try to find by exact position match among remaining targets
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		// Check if this target is still in targetsRemaining (not collected)
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		// If this target matches the one we're swapping with and is still remaining
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions
	ball.xPos = targetX
	ball.yPos = targetY
	target.xPos = ballX
	target.yPos = ballY
	if (targetInTargets) {
		targetInTargets.xPos = ballX
		targetInTargets.yPos = ballY
	}
	
	// Ensure target is instantly visible
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndObstacle(obstacleIndex) {
	let ballX = ball.xPos
	let ballY = ball.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions
	ball.xPos = obstacleX
	ball.yPos = obstacleY
	obstacle.xPos = ballX
	obstacle.yPos = ballY
	
	// Ensure obstacle is instantly visible
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndStar() {
	if (!star) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let starX = star.xPos
	let starY = star.yPos
	
	// Swap positions
	ball.xPos = starX
	ball.yPos = starY
	star.xPos = ballX
	star.yPos = ballY
	
	// Ensure star is instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndSwitcher() {
	if (!switcher) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions
	ball.xPos = switcherX
	ball.yPos = switcherY
	switcher.xPos = ballX
	switcher.yPos = ballY
	
	// Ensure switcher is instantly visible
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndSkull() {
	if (!skull) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let skullX = skull.xPos
	let skullY = skull.yPos
	
	// Swap positions
	ball.xPos = skullX
	ball.yPos = skullY
	skull.xPos = ballX
	skull.yPos = ballY
	
	// Ensure skull is instantly visible
	skull.fadeInOpacity = 1.0
	skull.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function handleTouchstart(e) {
	// Convert screen coordinates to canvas coordinates
	let canvasRect = canvas.getBoundingClientRect()
	touch1 = {
		xPos: e.touches[0].clientX - canvasRect.left,
		yPos: e.touches[0].clientY - canvasRect.top
	}
	isConvertingObstacle = false
	
	// TESTING: Clicking the score instantly advances to next level and increments score
	ctx.save()
	ctx.font = "bold 56px Arial"
	ctx.textAlign = "right"
	let scoreText = `${completionScore}`
	let scoreMetrics = ctx.measureText(scoreText)
	let scoreWidth = scoreMetrics.width || 0
	let ascent = scoreMetrics.actualBoundingBoxAscent
	let descent = scoreMetrics.actualBoundingBoxDescent
	if (!Number.isFinite(ascent)) ascent = 56
	if (!Number.isFinite(descent)) descent = 0
	ctx.restore()
	
	let scoreTextX = canvas.width - 12
	let scoreTextY = 56
	let scoreLeft = scoreTextX - scoreWidth
	let scoreRight = scoreTextX
	let scoreTop = scoreTextY - ascent
	let scoreBottom = scoreTextY + descent
	
	if (touch1.xPos >= scoreLeft && touch1.xPos <= scoreRight &&
	    touch1.yPos >= scoreTop && touch1.yPos <= scoreBottom) {
		// Clicked on score - instantly advance to next level
		completionScore++
		generateLevel()
		return
	}
	
	// While ball is animating to its new starting spot for the next level,
	// or auto-resetting after a failed shot, ignore user input so they can't
	// fling it mid-animation.
	if (ball && (ball.isSpawningToStart || autoResetActive)) {
		return
	}
	
	let targetRadius = getTargetRadius()
	let ballRadius = getBallRadius()
	
	// Check if tapping on a star (check before obstacles/targets to prioritize)
	if (star) {
		let starDistance = Math.hypot(touch1.xPos - star.xPos, touch1.yPos - star.yPos)
		if (starDistance < star.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping star - swap positions
				swapStarAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping star - swap positions
				swapStarAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'skull') {
				// Second tap: we have a skull selected, now tapping star - swap positions
				swapStarAndSkull()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping star - swap positions
				swapStarAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'ball') {
				// Second tap: we have a ball selected, now tapping star - swap positions
				swapBallAndStar()
				return
			} else {
				// First tap: select this star
				selectedForConversion = { type: 'star', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a skull (check before obstacles/targets to prioritize)
	if (skull) {
		let skullDistance = Math.hypot(touch1.xPos - skull.xPos, touch1.yPos - skull.yPos)
		if (skullDistance < skull.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping skull - swap positions
				swapSkullAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping skull - swap positions
				swapSkullAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping skull - swap positions
				swapStarAndSkull()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping skull - swap positions
				swapSkullAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'ball') {
				// Second tap: we have a ball selected, now tapping skull - swap positions
				swapBallAndSkull()
				return
			} else {
				// First tap: select this skull
				selectedForConversion = { type: 'skull', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a switcher (check before obstacles/targets to prioritize)
	if (switcher) {
		let switcherDistance = Math.hypot(touch1.xPos - switcher.xPos, touch1.yPos - switcher.yPos)
		if (switcherDistance < switcher.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping switcher - swap positions
				swapSwitcherAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping switcher - swap positions
				swapSwitcherAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping switcher - swap positions
				swapStarAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'skull') {
				// Second tap: we have a skull selected, now tapping switcher - swap positions
				swapSkullAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'ball') {
				// Second tap: we have a ball selected, now tapping switcher - swap positions
				swapBallAndSwitcher()
				return
			} else {
				// First tap: select this switcher
				selectedForConversion = { type: 'switcher', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on an obstacle (check before ball to prioritize smaller targets)
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		let distance = Math.hypot(touch1.xPos - obstacle.xPos, touch1.yPos - obstacle.yPos)
		if (distance < targetRadius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping obstacle - convert both
				convertTargetAndObstacle(selectedForConversion.index, i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping obstacle - swap positions
				swapStarAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'skull') {
				// Second tap: we have a skull selected, now tapping obstacle - swap positions
				swapSkullAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping obstacle - swap positions
				swapSwitcherAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'ball') {
				// Second tap: we have a ball selected, now tapping obstacle - swap positions
				swapBallAndObstacle(i)
				return
			} else {
				// First tap: select this obstacle
				selectedForConversion = { type: 'obstacle', index: i }
				
				// Advance tutorial to switching mechanic once player taps an obstacle.
				if (level === 1 && tutorialStep === 2 && !tutorialCompleted) {
					tutorialStep = 3
					updateTutorial()
				}
				return
			}
		}
	}
	
	// Check if tapping on a target
	for (let i = targetsRemaining.length - 1; i >= 0; i--) {
		let target = targetsRemaining[i]
		let distance = Math.hypot(touch1.xPos - target.xPos, touch1.yPos - target.yPos)
		if (distance < targetRadius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping target - convert both
				convertTargetAndObstacle(i, selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping target - swap positions
				swapStarAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'skull') {
				// Second tap: we have a skull selected, now tapping target - swap positions
				swapSkullAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping target - swap positions
				swapSwitcherAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'ball') {
				// Second tap: we have a ball selected, now tapping target - swap positions
				swapBallAndTarget(i)
				return
			} else {
				// First tap: select this target
				selectedForConversion = { type: 'target', index: i }
				
				// Advance tutorial to switching mechanic once player taps a target.
				if (level === 1 && tutorialStep === 2 && !tutorialCompleted) {
					tutorialStep = 3
					updateTutorial()
				}
				return
			}
		}
	}
	
	// Check if tapping on the ball (check after targets/obstacles to avoid blocking them)
	let ballDistance = Math.hypot(touch1.xPos - ball.xPos, touch1.yPos - ball.yPos)
	if (ballDistance < ballRadius + TOUCH_TOLERANCE) {
		// If the ball is still moving fast enough, ignore this tap so you can't "double-fling".
		let currentSpeed = Math.hypot(ball.xVel, ball.yVel)
		if (currentSpeed > BALL_STOP_SPEED) {
			return
		}

		// Check if we have something selected to swap with
		if (selectedForConversion) {
			if (selectedForConversion.type === 'target') {
				swapBallAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion.type === 'obstacle') {
				swapBallAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion.type === 'star') {
				swapBallAndStar()
				return
			} else if (selectedForConversion.type === 'switcher') {
				swapBallAndSwitcher()
				return
			} else if (selectedForConversion.type === 'skull') {
				swapBallAndSkull()
				return
			}
		}
		
		// If nothing selected, select the ball (but allow flinging on drag)
		selectedForConversion = { type: 'ball', index: 0 }
		ball.isBeingFlung = true
		// Don't set shotActive here - only set it when user actually drags
		return
	}
	
	// If tapping empty space, clear selection
	selectedForConversion = null
}

function handleTouchmove(e) {
	e.preventDefault()
	let touch2 = { 
		xPos: e.touches[0].clientX, 
		yPos: e.touches[0].clientY 
	}
	if (ball.isBeingFlung) {
		// Only start a shot when user actually drags (not just taps)
		if (!shotActive) {
			shotActive = true
			// Reset skull hit flag when starting a new try
			skullHitThisTry = false
			// Handle tutorial progression when the ball is flung.
			// Level 1: multi-step tutorial (only advance 1 -> 2 here).
			if (level === 1 && !tutorialCompleted && tutorialStep === 1) {
				tutorialStep = 2
				updateTutorial()
			}
			// Level 2: when the ball is flung for the first time on this level,
			// show the final tutorial text. Subsequent flings on the same level
			// won't re-show it after it has faded out.
			if (level === 2 && tries === 0) {
				let tutorialOverlay = document.getElementById("tutorialOverlay")
				if (tutorialOverlay) {
					tutorialOverlay.textContent = "Think carefully, aim true, and seize glory!"
					tutorialOverlay.style.opacity = "1"
					tutorialOverlay.style.visibility = "visible"
				}
			}
			tries++
		}
		ball.xVel = (touch2.xPos - touch1.xPos) / FLING_DIVISOR
		ball.yVel = (touch2.yPos - touch1.yPos) / FLING_DIVISOR
	}
}

function handleTouchend() {
	ball.isBeingFlung = false
	isConvertingObstacle = false
}

function placeBall() {
	let radius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5 // Minimum gap between sprite edges
	let maxAttempts = 100
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure ball is fully within canvas bounds
		xPos = radius + (canvas.width - 2 * radius) * Math.random()
		yPos = canvas.height - getShim()
		
		// Verify yPos is within bounds (accounting for radius)
		if (yPos - radius < 0) {
			yPos = radius
		}
		if (yPos + radius > canvas.height) {
			yPos = canvas.height - radius
		}
		
		validPosition = true
		
		// Check distance from existing targets using proper Euclidean distance
		for (let i = 0; i < targets.length; i++) {
			let target = targets[i]
			let dx = xPos - target.xPos
			let dy = yPos - target.yPos
			let distance = Math.hypot(dx, dy)
			let minDistance = radius + targetRadius + minSeparation
			if (distance < minDistance) {
				validPosition = false
				break
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = radius + (canvas.width - 2 * radius) * Math.random()
		yPos = Math.max(radius, Math.min(canvas.height - radius, canvas.height - getShim()))
	}

	ball = {
		xPos: xPos,
		yPos: yPos,
		xVel: 0,
		yVel: 0,
		isBeingFlung: false
	}
}

function placeTargetsWithCount(targetCount) {
	targets = []
	let radius = getTargetRadius()
	let ballRadius = getBallRadius()
	let minSeparation = 5 // Minimum gap between sprite edges
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep blue balls away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	
	for (let i = 0; i < targetCount; i++) {
		let attempts = 0
		let xPos, yPos
		let validPosition = false
		
		while (!validPosition && attempts < maxAttempts) {
			// Ensure target is fully within canvas bounds, and not too close
			// to the bottom edge.
			xPos = radius + (canvas.width - 2 * radius) * Math.random()
			// Exclude top area unless high level, and also exclude a band
			// near the bottom based on grey ball size.
			let minY = radius + topExclusionZone
			let maxY = canvas.height - Math.max(radius, bottomExclusion)
			yPos = minY + (maxY - minY) * Math.random()
			validPosition = true
			
			// Check distance from ball using proper Euclidean distance
			let dx = xPos - ball.xPos
			let dy = yPos - ball.yPos
			let distance = Math.hypot(dx, dy)
			let minDistance = radius + ballRadius + minSeparation
			if (distance < minDistance) {
				validPosition = false
			}
			
			// Check distance from other targets using proper Euclidean distance
			if (validPosition) {
				for (let j = 0; j < targets.length; j++) {
					let dx2 = xPos - targets[j].xPos
					let dy2 = yPos - targets[j].yPos
					let distance2 = Math.hypot(dx2, dy2)
					let minDistance2 = radius + radius + minSeparation
					if (distance2 < minDistance2) {
						validPosition = false
						break
					}
				}
			}
			
			attempts++
		}
		
		// Fallback: ensure position is valid even if loop exhausted attempts
		if (!validPosition) {
			xPos = radius + (canvas.width - 2 * radius) * Math.random()
			let minY = radius + topExclusionZone
			let maxY = canvas.height - Math.max(radius, bottomExclusion)
			yPos = minY + (maxY - minY) * Math.random()
		}
		
		targets.push({ 
			xPos: xPos, 
			yPos: yPos,
			fadeInOpacity: 0, // Start invisible for fade-in
			fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
		})
	}
}

function placeObstaclesWithCount(obstacleCount) {
	obstacles = []
	let obstacleRadius = getTargetRadius()
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5 // Minimum gap between sprite edges
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep red balls away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	
	for (let i = 0; i < obstacleCount; i++) {
		let attempts = 0
		let xPos, yPos
		let validPosition = false
		
		while (!validPosition && attempts < 100) {
			// Ensure obstacle is fully within canvas bounds, and not too close
			// to the bottom edge.
			xPos = obstacleRadius + (canvas.width - 2 * obstacleRadius) * Math.random()
			// Exclude top area unless high level, and also exclude a band
			// near the bottom based on grey ball size.
			let minY = obstacleRadius + topExclusionZone
			let maxY = canvas.height - Math.max(obstacleRadius, bottomExclusion)
			yPos = minY + (maxY - minY) * Math.random()
			validPosition = true
			
			// Check distance from ball using proper Euclidean distance
			let dx = xPos - ball.xPos
			let dy = yPos - ball.yPos
			let distance = Math.hypot(dx, dy)
			let minDistance = obstacleRadius + ballRadius + minSeparation
			if (distance < minDistance) {
				validPosition = false
			}
			
			// Check distance from targets using proper Euclidean distance
			if (validPosition) {
				for (let j = 0; j < targets.length; j++) {
					let dx2 = xPos - targets[j].xPos
					let dy2 = yPos - targets[j].yPos
					let distance2 = Math.hypot(dx2, dy2)
					let minDistance2 = obstacleRadius + targetRadius + minSeparation
					if (distance2 < minDistance2) {
						validPosition = false
						break
					}
				}
			}
			
			// Check distance from other obstacles using proper Euclidean distance
			if (validPosition) {
				for (let j = 0; j < obstacles.length; j++) {
					let dx3 = xPos - obstacles[j].xPos
					let dy3 = yPos - obstacles[j].yPos
					let distance3 = Math.hypot(dx3, dy3)
					let minDistance3 = obstacleRadius + obstacles[j].radius + minSeparation
					if (distance3 < minDistance3) {
						validPosition = false
						break
					}
				}
			}
			
			attempts++
		}
		
		// Fallback: ensure position is valid even if loop exhausted attempts
		if (!validPosition) {
			xPos = obstacleRadius + (canvas.width - 2 * obstacleRadius) * Math.random()
			let minY = obstacleRadius + topExclusionZone
			let maxY = canvas.height - Math.max(obstacleRadius, bottomExclusion)
			yPos = minY + (maxY - minY) * Math.random()
		}
		
		obstacles.push({ 
			xPos: xPos, 
			yPos: yPos,
			radius: obstacleRadius,
			fadeInOpacity: 0, // Start invisible for fade-in
			fadeInStartTime: Date.now() + FADE_IN_DELAY, // Delay before fade-in starts
			_fadeInInitialized: true // Flag to ensure fade-in is properly initialized
		})
	}
}

function placeTrophy() {
	// Make the trophy substantially larger than targets.
	let trophyRadius = getTargetRadius() * 4.5
	let ballRadius = getBallRadius()
	let minSeparation = 5
	
	// First, animate the grey ball to a random position at the bottom of the screen
	// (same animation style as level start/restart)
	// Add padding to avoid corners - keep ball away from left/right edges
	let horizontalPadding = getShim() // Same padding as vertical
	let ballTargetX = ballRadius + horizontalPadding + (canvas.width - 2 * ballRadius - 2 * horizontalPadding) * Math.random()
	let ballTargetY = canvas.height - getShim()
	
	// Verify ball target yPos is within bounds
	if (ballTargetY - ballRadius < 0) {
		ballTargetY = ballRadius
	}
	if (ballTargetY + ballRadius > canvas.height) {
		ballTargetY = canvas.height - ballRadius
	}
	
	// Set up the spawn animation to move the ball to the bottom
	ball.spawnFromX = ball.xPos
	ball.spawnFromY = ball.yPos
	ball.spawnToX = ballTargetX
	ball.spawnToY = ballTargetY
	ball.spawnStartTime = Date.now()
	ball.isSpawningToStart = true
	
	// Start the ball visually at its current location, but stop its velocity
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	// Place the trophy at a random valid position on the board
	// Ensure it's positioned well above the ball's new bottom position
	let maxAttempts = 100
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	// Minimum vertical separation between trophy and ball's new bottom position
	let minVerticalSeparation = 3 * (trophyRadius + ballRadius)
	let ballBottomY = ballTargetY + ballRadius
	
		while (!validPosition && attempts < maxAttempts) {
			// Random position on canvas
			xPos = trophyRadius + (canvas.width - 2 * trophyRadius) * Math.random()
			yPos = trophyRadius + (canvas.height - 2 * trophyRadius) * Math.random()
			validPosition = true
			
			// Never place the trophy in the top-right quadrant of the board
			if (xPos > canvas.width / 2 && yPos < canvas.height / 2) {
				validPosition = false
			}

			// Ensure the trophy is positioned well above the ball's new bottom position
			if (validPosition) {
				let trophyTopY = yPos - trophyRadius
				if (trophyTopY > ballBottomY - minVerticalSeparation) {
					validPosition = false
				}
			}

			// Keep the trophy away from the score in the top-right corner so it
			// never visually overlaps or hides the score digits.
			if (validPosition) {
				let scoreDigitWidth = 60   // a bit wider than a single digit
				let scoreDigitHeight = 80  // a bit taller for safety
				let scoreRight = canvas.width - 12
				let scoreLeft = scoreRight - scoreDigitWidth
				let scoreBottom = 56
				let scoreTop = scoreBottom - scoreDigitHeight

				if (
					xPos + trophyRadius > scoreLeft &&
					xPos - trophyRadius < scoreRight &&
					yPos + trophyRadius > scoreTop &&
					yPos - trophyRadius < scoreBottom
				) {
					validPosition = false
				}
			}
			
			attempts++
		}
	
	// Fallback: place at center if no valid position found
	if (!validPosition) {
		xPos = canvas.width / 2
		yPos = canvas.height / 2
		// Still ensure it's above the ball's bottom position
		if (yPos - trophyRadius > ballBottomY - minVerticalSeparation) {
			yPos = ballBottomY - minVerticalSeparation + trophyRadius
		}
	}
	
	trophy = {
		xPos: xPos,
		yPos: yPos,
		radius: trophyRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now()
	}
	
	// Clear the last target position once we've placed the trophy
	lastTargetX = null
	lastTargetY = null
}

function placeTargets() {
	// Level 1: 3 targets, later levels: 5 targets.
	let targetCount = (level === 1) ? 3 : 5
	placeTargetsWithCount(targetCount)
}

function placeObstacles() {
	// Use fewer obstacles on the very first level to ease players in.
	// Level 1: 3 obstacles, later levels: 5 obstacles.
	let obstacleCount = (level === 1) ? 3 : 5
	placeObstaclesWithCount(obstacleCount)
}

function placeStar() {
	let starRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep star away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure star is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = starRadius + (canvas.width - 2 * starRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = starRadius + topExclusionZone
		let maxY = canvas.height - Math.max(starRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = starRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = starRadius + targetRadius + minSeparation
				if (distance2 < minDistance2) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from obstacles
		if (validPosition) {
			for (let j = 0; j < obstacles.length; j++) {
				let dx3 = xPos - obstacles[j].xPos
				let dy3 = yPos - obstacles[j].yPos
				let distance3 = Math.hypot(dx3, dy3)
				let minDistance3 = starRadius + obstacles[j].radius + minSeparation
				if (distance3 < minDistance3) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from switcher if it exists
		if (validPosition && switcher) {
			let dx4 = xPos - switcher.xPos
			let dy4 = yPos - switcher.yPos
			let distance4 = Math.hypot(dx4, dy4)
			let minDistance4 = starRadius + switcher.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from skull if it exists
		if (validPosition && skull) {
			let dx5 = xPos - skull.xPos
			let dy5 = yPos - skull.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = starRadius + skull.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = starRadius + (canvas.width - 2 * starRadius) * Math.random()
		let minY = starRadius + topExclusionZone
		let maxY = canvas.height - Math.max(starRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	star = {
		xPos: xPos,
		yPos: yPos,
		radius: starRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function placeSwitcher() {
	let switcherRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep switcher away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure switcher is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = switcherRadius + (canvas.width - 2 * switcherRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = switcherRadius + topExclusionZone
		let maxY = canvas.height - Math.max(switcherRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = switcherRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = switcherRadius + targetRadius + minSeparation
				if (distance2 < minDistance2) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from obstacles
		if (validPosition) {
			for (let j = 0; j < obstacles.length; j++) {
				let dx3 = xPos - obstacles[j].xPos
				let dy3 = yPos - obstacles[j].yPos
				let distance3 = Math.hypot(dx3, dy3)
				let minDistance3 = switcherRadius + obstacles[j].radius + minSeparation
				if (distance3 < minDistance3) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from star if it exists
		if (validPosition && star) {
			let dx4 = xPos - star.xPos
			let dy4 = yPos - star.yPos
			let distance4 = Math.hypot(dx4, dy4)
			let minDistance4 = switcherRadius + star.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from skull if it exists
		if (validPosition && skull) {
			let dx5 = xPos - skull.xPos
			let dy5 = yPos - skull.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = switcherRadius + skull.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = switcherRadius + (canvas.width - 2 * switcherRadius) * Math.random()
		let minY = switcherRadius + topExclusionZone
		let maxY = canvas.height - Math.max(switcherRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	switcher = {
		xPos: xPos,
		yPos: yPos,
		radius: switcherRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function placeSkull() {
	let skullRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep skull away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure skull is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = skullRadius + (canvas.width - 2 * skullRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = skullRadius + topExclusionZone
		let maxY = canvas.height - Math.max(skullRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = skullRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = skullRadius + targetRadius + minSeparation
				if (distance2 < minDistance2) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from obstacles
		if (validPosition) {
			for (let j = 0; j < obstacles.length; j++) {
				let dx3 = xPos - obstacles[j].xPos
				let dy3 = yPos - obstacles[j].yPos
				let distance3 = Math.hypot(dx3, dy3)
				let minDistance3 = skullRadius + obstacles[j].radius + minSeparation
				if (distance3 < minDistance3) {
					validPosition = false
					break
				}
			}
		}
		
		// Check distance from star if it exists
		if (validPosition && star) {
			let dx4 = xPos - star.xPos
			let dy4 = yPos - star.yPos
			let distance4 = Math.hypot(dx4, dy4)
			let minDistance4 = skullRadius + star.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from switcher if it exists
		if (validPosition && switcher) {
			let dx5 = xPos - switcher.xPos
			let dy5 = yPos - switcher.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = skullRadius + switcher.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = skullRadius + (canvas.width - 2 * skullRadius) * Math.random()
		let minY = skullRadius + topExclusionZone
		let maxY = canvas.height - Math.max(skullRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	skull = {
		xPos: xPos,
		yPos: yPos,
		radius: skullRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function moveBall() {
	// If the ball is animating into its starting spot for a new level, override normal motion
	if (ball && ball.isSpawningToStart) {
		let duration = SPAWN_ANIMATION_DURATION
		let elapsed = Date.now() - ball.spawnStartTime
		let t = Math.min(1, Math.max(0, elapsed / duration))
		
		// Simple ease-out interpolation for a smoother feel
		let easeT = 1 - Math.pow(1 - t, 2)
		
		ball.xPos = ball.spawnFromX + (ball.spawnToX - ball.spawnFromX) * easeT
		ball.yPos = ball.spawnFromY + (ball.spawnToY - ball.spawnFromY) * easeT
		ball.xVel = 0
		ball.yVel = 0
		
		if (t >= 1) {
			// Snap to final position and end the spawn animation
			ball.xPos = ball.spawnToX
			ball.yPos = ball.spawnToY
			ball.isSpawningToStart = false
		}
		return
	}

	// If we're in the middle of an auto-reset (failed shot), animate the ball
	// moving back to its starting spot for this level.
	if (autoResetActive) {
		let elapsed = Date.now() - autoResetStartTime
		let t = Math.min(1, Math.max(0, elapsed / AUTO_RESET_DURATION))
		// Simple ease-out interpolation for a smoother feel
		let easeT = 1 - Math.pow(1 - t, 2)
		ball.xPos = autoResetBallFromX + (autoResetBallToX - autoResetBallFromX) * easeT
		ball.yPos = autoResetBallFromY + (autoResetBallToY - autoResetBallFromY) * easeT
		ball.xVel = 0
		ball.yVel = 0
		if (t >= 1) {
			ball.xPos = autoResetBallToX
			ball.yPos = autoResetBallToY
			autoResetActive = false
		}
		return
	}

	// Normal motion
	ball.xPos += ball.xVel
	ball.yPos += ball.yVel
	ball.xVel *= FRICTION 
	ball.yVel *= FRICTION

	// If a shot is in progress, the ball has effectively stopped (after the fling),
	// and we still have targets remaining, start a quick animated reset of this
	// level: ball glides back to its starting spot while previously-cleared
	// targets fade back in, both finishing at the same time.
	if (shotActive && !ball.isBeingFlung && !pendingNextLevel && !isGeneratingLevel && targetsRemaining.length > 0) {
		let speed = Math.hypot(ball.xVel, ball.yVel)
		if (speed < BALL_STOP_SPEED) {
			// If the ball is still moving fast enough and our simple straight-line-
			// with-friction prediction says it will clear all remaining targets,
			// don't end the run yet.
			if (speed >= BALL_MIN_CONTINUE_SPEED && willClearAllTargetsOnCurrentPath()) {
				return
			}

			shotActive = false

			// Set up ball auto-reset animation
			autoResetActive = true
			autoResetStartTime = Date.now()
			autoResetBallFromX = ball.xPos
			autoResetBallFromY = ball.yPos
			if (savedBall) {
				autoResetBallToX = savedBall.xPos
				autoResetBallToY = savedBall.yPos
			} else {
				// Fallback: use current position if we somehow don't have a saved ball
				autoResetBallToX = ball.xPos
				autoResetBallToY = ball.yPos
			}
			ball.xVel = 0
			ball.yVel = 0
			ball.isBeingFlung = false

			// CRITICAL: Restore everything to exactly match the initial level state
			// Restore targets array first
			if (savedTargets && savedTargets.length > 0) {
				targets = JSON.parse(JSON.stringify(savedTargets))
			}
			
			// Restore targetsRemaining from savedTargets - all targets should be visible with fade-in
			if (savedTargets && savedTargets.length > 0) {
				let newTargetsRemaining = []
				for (let i = 0; i < savedTargets.length; i++) {
					newTargetsRemaining.push({
						xPos: savedTargets[i].xPos,
						yPos: savedTargets[i].yPos,
						fadeInOpacity: 0,
						fadeInStartTime: autoResetStartTime
					})
				}
				targetsRemaining = newTargetsRemaining
			}
			
			// Restore obstacles from savedObstacles - exactly as they were at level start
			if (savedObstacles && savedObstacles.length > 0) {
				obstacles = JSON.parse(JSON.stringify(savedObstacles))
				// Add fade-in to all restored obstacles
				for (let i = 0; i < obstacles.length; i++) {
					obstacles[i].fadeInOpacity = 0
					obstacles[i].fadeInStartTime = autoResetStartTime
				}
			}
			
			// Restore sprites (star, switcher, skull) exactly as they were at level start
			if (savedStar) {
				star = JSON.parse(JSON.stringify(savedStar))
				star.fadeInOpacity = 0
				star.fadeInStartTime = autoResetStartTime
			} else {
				star = null
			}
			if (savedSwitcher) {
				switcher = JSON.parse(JSON.stringify(savedSwitcher))
				switcher.fadeInOpacity = 0
				switcher.fadeInStartTime = autoResetStartTime
			} else {
				switcher = null
			}
			if (savedSkull) {
				skull = JSON.parse(JSON.stringify(savedSkull))
				skull.fadeInOpacity = 0
				skull.fadeInStartTime = autoResetStartTime
				// Reset skull hit flag so it can be hit again
				skullHitThisTry = false
			} else {
				skull = null
			}
			
			return
		}
	}
}

// Simple predictive check: simulate the ball's current straight-line motion with
// friction for a short time window and see if it would pass over all remaining
// targets. Ignores obstacles but is good enough to avoid ending a run
// that is clearly about to succeed.
function willClearAllTargetsOnCurrentPath() {
	if (!ball || targetsRemaining.length === 0) return false

	let simX = ball.xPos
	let simY = ball.yPos
	let simVX = ball.xVel
	let simVY = ball.yVel
	let simTargets = targetsRemaining.map(t => ({ xPos: t.xPos, yPos: t.yPos }))

	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let maxSteps = 90 // about 3 seconds at 30 FPS
	let minSpeed = 0.5

	for (let step = 0; step < maxSteps; step++) {
		// Advance simulated ball
		simX += simVX
		simY += simVY
		simVX *= FRICTION
		simVY *= FRICTION

		let speed = Math.hypot(simVX, simVY)
		if (speed < minSpeed) break

		// Check for hits on remaining targets
		for (let i = simTargets.length - 1; i >= 0; i--) {
			let t = simTargets[i]
			let dx = simX - t.xPos
			let dy = simY - t.yPos
			let dist = Math.hypot(dx, dy)
			if (dist < ballRadius + targetRadius) {
				simTargets.splice(i, 1)
			}
		}

		if (simTargets.length === 0) {
			return true
		}
	}

	return false
}

function handleCollision() {
	// While the ball is animating into its new starting spot OR auto-resetting a failed shot,
	// ignore collisions so nothing interferes with these animations.
	if (ball && (ball.isSpawningToStart || autoResetActive)) {
		return
	}
	handleCollisionWithTarget()
	handleCollisionWithObstacle()
	handleCollisionWithEdge()
	handleCollisionWithStar()
	handleCollisionWithSwitcher()
	handleCollisionWithSkull()
	handleCollisionWithTrophy()
}

function handleCollisionWithTarget() {
	for (let i = 0; i < targetsRemaining.length; i++) {
		let target = targetsRemaining[i]
		let collisionDistance = getBallRadius() + getTargetRadius()
		let dx = ball.xPos - target.xPos
		let dy = ball.yPos - target.yPos
		let distance = Math.hypot(dx, dy)
		if (distance < collisionDistance) {
			let rewardPoints = Math.round(100 / Math.max(tries, 1))
			let wasLastTarget = targetsRemaining.length === 1
			let targetX = target.xPos
			let targetY = target.yPos
			targetsRemaining.splice(i, 1)
			totalScore += rewardPoints
			pointsThisLevel += rewardPoints
			
			// Create fireworks every time a target is collected
			createFireworks(targetX, targetY)
			
			// Fade away obstacles when last target is collected
			if (wasLastTarget) {
				// This shot successfully cleared all targets
				shotActive = false
				
				// Remember where the last target was collected so we can place the trophy there
				lastTargetX = targetX
				lastTargetY = targetY
				
				// Start fading obstacles and create red fireworks after delay
				setTimeout(() => {
					for (let j = 0; j < obstacles.length; j++) {
						let obstacle = obstacles[j]
						createFireworks(obstacle.xPos, obstacle.yPos, "red")
						obstacle.fadeOpacity = 1.0
						obstacle.fading = true
					}
				}, OBSTACLE_FADE_DELAY)
				
				// Fade tutorial text after delay (but skip step 2 and level 2 tutorial - they fade after trophy)
				tutorialExplosionTimeout = setTimeout(() => {
					let tutorialOverlay = document.getElementById("tutorialOverlay")
					if (tutorialOverlay && tutorialOverlay.style.visibility === "visible") {
						let tutorialText = tutorialOverlay.textContent
						// Don't fade step 2 here - it stays until next level appears
						// Don't fade level 2 tutorial here - it stays until next level appears
						if (tutorialText !== "Hit all the blue balls to win" && 
						    tutorialText !== "Think carefully, aim true, and seize glory!") {
							tutorialOverlay.style.opacity = "0"
						}
					}
					tutorialExplosionTimeout = null
				}, TUTORIAL_FADE_DELAY)
				
				// Place trophy after delay
				setTimeout(() => {
					placeTrophy()
					// Tutorial step 2 and level 2 tutorial both stay until next level appears
				}, TROPHY_PLACEMENT_DELAY)
			}
		}
	}
}

function handleCollisionWithObstacle() {
	let ballRadius = getBallRadius()
	let pushAwayBuffer = 1 // Small buffer to prevent sticking
	
	for (let i = 0; i < obstacles.length; i++) {
		let obstacle = obstacles[i]
		let dx = ball.xPos - obstacle.xPos
		let dy = ball.yPos - obstacle.yPos
		let distance = Math.hypot(dx, dy)
		let collisionDistance = ballRadius + obstacle.radius
		
		if (distance < collisionDistance && distance > 0) {
			// Normalize direction
			let normalX = dx / distance
			let normalY = dy / distance
			
			// Position ball at edge of obstacle with a small buffer to prevent sticking
			let separationDistance = collisionDistance + pushAwayBuffer
			ball.xPos = obstacle.xPos + normalX * separationDistance
			ball.yPos = obstacle.yPos + normalY * separationDistance
			
			// Reflect velocity and add a small push-away to prevent orbiting
			let dot = ball.xVel * normalX + ball.yVel * normalY
			ball.xVel = ball.xVel - 2 * dot * normalX + normalX * 0.5
			ball.yVel = ball.yVel - 2 * dot * normalY + normalY * 0.5
		}
	}
}

function handleCollisionWithEdge() {
	let radius = getBallRadius()
	
	// Check top and bottom edges
	if (ball.yPos - radius <= 0) {
		ball.yPos = radius
		ball.yVel = -ball.yVel
	} else if (ball.yPos + radius >= canvas.height) {
		ball.yPos = canvas.height - radius
		ball.yVel = -ball.yVel
	}
	
	// Check left and right edges
	if (ball.xPos - radius <= 0) {
		ball.xPos = radius
		ball.xVel = -ball.xVel
	} else if (ball.xPos + radius >= canvas.width) {
		ball.xPos = canvas.width - radius
		ball.xVel = -ball.xVel
	}
}

function handleCollisionWithStar() {
	if (!star) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - star.xPos
	let dy = ball.yPos - star.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + star.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Save star position before removing it
		let starX = star.xPos
		let starY = star.yPos
		
		// Ball hit the star - remove the 3 obstacles closest to the star
		if (obstacles.length > 0) {
			// Calculate distances from star to all obstacles
			let obstaclesWithDistances = obstacles.map((obstacle, index) => {
				let dx = star.xPos - obstacle.xPos
				let dy = star.yPos - obstacle.yPos
				let dist = Math.hypot(dx, dy)
				return { obstacle, index, distance: dist }
			})
			
			// Sort by distance (closest first)
			obstaclesWithDistances.sort((a, b) => a.distance - b.distance)
			
			// Remove the 3 closest obstacles (or all if fewer than 3)
			let removeCount = Math.min(3, obstaclesWithDistances.length)
			let indicesToRemove = obstaclesWithDistances.slice(0, removeCount).map(item => item.index)
			
			// Sort indices in descending order to remove from end to start (avoids index shifting issues)
			indicesToRemove.sort((a, b) => b - a)
			for (let idx of indicesToRemove) {
				obstacles.splice(idx, 1)
			}
		}
		
		// Remove the star
		star = null
		// Don't update savedObstacles - auto-reset should restore to original level state
	}
}

function handleCollisionWithSwitcher() {
	if (!switcher) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - switcher.xPos
	let dy = ball.yPos - switcher.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + switcher.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Ball hit the switcher - switch all red and blue balls
		// Save all positions
		let targetPositions = targets.map(t => ({ xPos: t.xPos, yPos: t.yPos }))
		let obstaclePositions = obstacles.map(o => ({ xPos: o.xPos, yPos: o.yPos }))
		
		// Switch positions: targets get obstacle positions, obstacles get target positions
		// Handle cases where counts might differ
		let minCount = Math.min(targets.length, obstacles.length)
		for (let i = 0; i < minCount; i++) {
			targets[i].xPos = obstaclePositions[i].xPos
			targets[i].yPos = obstaclePositions[i].yPos
			obstacles[i].xPos = targetPositions[i].xPos
			obstacles[i].yPos = targetPositions[i].yPos
			
			// Ensure all swapped items are instantly visible
			targets[i].fadeInOpacity = 1.0
			targets[i].fadeInStartTime = Date.now()
			obstacles[i].fadeInOpacity = 1.0
			obstacles[i].fadeInStartTime = Date.now()
		}
		
		// If there are more targets than obstacles, remaining targets keep their positions
		// If there are more obstacles than targets, remaining obstacles keep their positions
		
		// Update targetsRemaining to match targets
		targetsRemaining = JSON.parse(JSON.stringify(targets))
		
		// Ensure all targetsRemaining are instantly visible
		for (let i = 0; i < targetsRemaining.length; i++) {
			targetsRemaining[i].fadeInOpacity = 1.0
			targetsRemaining[i].fadeInStartTime = Date.now()
		}
		
		// Don't update savedTargets or savedObstacles - auto-reset should restore to original level state
		
		// Remove the switcher
		switcher = null
	}
}

function handleCollisionWithSkull() {
	if (!skull || skullHitThisTry) return // Idempotent: only work once per try
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - skull.xPos
	let dy = ball.yPos - skull.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + skull.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Ball hit the skull - double the number of obstacles (idempotent)
		skullHitThisTry = true
		
		// Save current obstacle count
		let currentObstacleCount = obstacles.length
		
		// Add new obstacles equal to current count
		let obstacleRadius = getTargetRadius()
		let ballRadius = getBallRadius()
		let targetRadius = getTargetRadius()
		let minSeparation = 5
		let topExclusionZone = 0
		let bottomExclusion = 8 * ballRadius
		
		for (let i = 0; i < currentObstacleCount; i++) {
			let attempts = 0
			let xPos, yPos
			let validPosition = false
			
			while (!validPosition && attempts < 100) {
				xPos = obstacleRadius + (canvas.width - 2 * obstacleRadius) * Math.random()
				let minY = obstacleRadius + topExclusionZone
				let maxY = canvas.height - Math.max(obstacleRadius, bottomExclusion)
				yPos = minY + (maxY - minY) * Math.random()
				validPosition = true
				
				// Check distance from ball
				let dx = xPos - ball.xPos
				let dy = yPos - ball.yPos
				let dist = Math.hypot(dx, dy)
				let minDist = obstacleRadius + ballRadius + minSeparation
				if (dist < minDist) {
					validPosition = false
				}
				
				// Check distance from targets
				if (validPosition) {
					for (let j = 0; j < targets.length; j++) {
						let dx2 = xPos - targets[j].xPos
						let dy2 = yPos - targets[j].yPos
						let dist2 = Math.hypot(dx2, dy2)
						let minDist2 = obstacleRadius + targetRadius + minSeparation
						if (dist2 < minDist2) {
							validPosition = false
							break
						}
					}
				}
				
				// Check distance from existing obstacles
				if (validPosition) {
					for (let j = 0; j < obstacles.length; j++) {
						let dx3 = xPos - obstacles[j].xPos
						let dy3 = yPos - obstacles[j].yPos
						let dist3 = Math.hypot(dx3, dy3)
						let minDist3 = obstacleRadius + obstacles[j].radius + minSeparation
						if (dist3 < minDist3) {
							validPosition = false
							break
						}
					}
				}
				
				// Check distance from skull
				if (validPosition && skull) {
					let dx4 = xPos - skull.xPos
					let dy4 = yPos - skull.yPos
					let dist4 = Math.hypot(dx4, dy4)
					let minDist4 = obstacleRadius + skull.radius + minSeparation
					if (dist4 < minDist4) {
						validPosition = false
					}
				}
				
				// Check distance from star if it exists
				if (validPosition && star) {
					let dx5 = xPos - star.xPos
					let dy5 = yPos - star.yPos
					let dist5 = Math.hypot(dx5, dy5)
					let minDist5 = obstacleRadius + star.radius + minSeparation
					if (dist5 < minDist5) {
						validPosition = false
					}
				}
				
				// Check distance from switcher if it exists
				if (validPosition && switcher) {
					let dx6 = xPos - switcher.xPos
					let dy6 = yPos - switcher.yPos
					let dist6 = Math.hypot(dx6, dy6)
					let minDist6 = obstacleRadius + switcher.radius + minSeparation
					if (dist6 < minDist6) {
						validPosition = false
					}
				}
				
				attempts++
			}
			
			// Fallback: ensure position is valid even if loop exhausted attempts
			if (!validPosition) {
				xPos = obstacleRadius + (canvas.width - 2 * obstacleRadius) * Math.random()
				let minY = obstacleRadius + topExclusionZone
				let maxY = canvas.height - Math.max(obstacleRadius, bottomExclusion)
				yPos = minY + (maxY - minY) * Math.random()
			}
			
			obstacles.push({
				xPos: xPos,
				yPos: yPos,
				radius: obstacleRadius,
				fadeInOpacity: 1.0, // Instantly visible
				fadeInStartTime: Date.now() // Already started
			})
		}
		
		// Don't update savedObstacles - auto-reset should restore to original level state
		
		// Remove the skull
		skull = null
	}
}

function handleCollisionWithTrophy() {
	if (!trophy) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - trophy.xPos
	let dy = ball.yPos - trophy.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + trophy.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Ball hit the trophy - start animation toward the score indicator
		// Prevent multiple collisions
		if (trophy.animating) return

		// Compute the visual center of the completion score text, so the trophy flies
		// directly into it (instead of the text's right-edge baseline).
		let scoreCenter = getScoreCenter()
		
		// Start animation
		trophy.animating = true
		trophy.animationStartTime = Date.now()
		trophy.startX = trophy.xPos
		trophy.startY = trophy.yPos
		trophy.targetX = scoreCenter.x
		trophy.targetY = scoreCenter.y
		trophy.animationDuration = FADE_DURATION
		trophy.levelChanged = false // Track if level has been changed
		trophy.offscreenAt = null
		pendingNextLevel = true
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	// For the very first level only, fade in the grey ball and score together.
	if (initialIntroActive && !hasCompletedALevel) {
		let elapsed = Date.now() - initialIntroStartTime
		let fadeDuration = FADE_DURATION
		let t = Math.min(1.0, Math.max(0.0, elapsed / fadeDuration))
		ball.fadeOpacity = t
		
		if (t >= 1.0) {
			initialIntroActive = false
			ball.fadeOpacity = 1.0
		}
	} else {
		// Ensure ball is fully visible after the intro
		ball.fadeOpacity = 1.0
	}

	drawBall()
	
	// Update fade-in for targets
	for (let i = 0; i < targetsRemaining.length; i++) {
		let target = targetsRemaining[i]
		// Initialize fade-in if missing
		if (target.fadeInOpacity === undefined || target.fadeInStartTime === undefined) {
			target.fadeInOpacity = 0
			target.fadeInStartTime = Date.now() + FADE_IN_DELAY
		}
		// Update fade-in only if start time has passed
		if (target.fadeInOpacity < 1.0 && target.fadeInStartTime <= Date.now()) {
			let elapsed = Date.now() - target.fadeInStartTime
			let fadeDuration = FADE_DURATION
			target.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
	}
	
	// Update fade-in and fade-out for obstacles
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		
		// CRITICAL: Always initialize fade-in if missing - this prevents flashing
		if (obstacle.fadeInOpacity === undefined || obstacle.fadeInStartTime === undefined) {
			obstacle.fadeInOpacity = 0
			obstacle.fadeInStartTime = Date.now() + FADE_IN_DELAY
		}
		
		// Handle fade-in - only update if start time has passed
		// This ensures obstacles gradually fade in from 0 to 1.0 after the delay
		if (obstacle.fadeInOpacity < 1.0 && obstacle.fadeInStartTime <= Date.now()) {
			let elapsed = Date.now() - obstacle.fadeInStartTime
			let fadeDuration = FADE_DURATION
			obstacle.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
		
		// Handle fade-out
		if (obstacle.fading) {
			obstacle.fadeOpacity -= 0.15 // Fade out very quickly (~0.2 seconds at 30fps)
			if (obstacle.fadeOpacity <= 0) {
				obstacles.splice(i, 1)
			}
		}
	}
	
	drawTargets()
	drawObstacles()
	drawStar()
	drawSwitcher()
	drawSkull()
	
	// Update trophy fade-in
	if (trophy && trophy.fadeInOpacity !== undefined && trophy.fadeInOpacity < 1.0) {
		let elapsed = Date.now() - trophy.fadeInStartTime
		let fadeDuration = 1000 // 1.0 seconds to fade in (slower)
		trophy.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	// Update trophy animation if active
	if (trophy && trophy.animating) {
		let currentTime = Date.now()
		let elapsed = currentTime - trophy.animationStartTime
		
		if (elapsed <= trophy.animationDuration) {
			// Interpolate to corner over exactly 1 second
			let progress = elapsed / trophy.animationDuration
			trophy.xPos = trophy.startX + (trophy.targetX - trophy.startX) * progress
			trophy.yPos = trophy.startY + (trophy.targetY - trophy.startY) * progress
		} else {
			// Continue moving past corner at same speed/direction
			let dx = trophy.targetX - trophy.startX
			let dy = trophy.targetY - trophy.startY
			let speed = Math.hypot(dx, dy) / (trophy.animationDuration / 1000) // pixels per second
			let angle = Math.atan2(dy, dx)
			let extraTime = (elapsed - trophy.animationDuration) / 1000 // seconds past 1 second
			let extraDistance = speed * extraTime
			
			trophy.xPos = trophy.targetX + Math.cos(angle) * extraDistance
			trophy.yPos = trophy.targetY + Math.sin(angle) * extraDistance
		}
		
		// Check if trophy has reached the completion score text (visual center)
		let scoreCenter = getScoreCenter()
		let distanceToIndicator = Math.hypot(trophy.xPos - scoreCenter.x, trophy.yPos - scoreCenter.y)
		
		if (distanceToIndicator < trophy.radius && !trophy.levelChanged) {
			// Trophy has contacted the score indicator:
			//  - wait a short delay, then increment the score
			//  - then change level (no grey-ball fade)
			trophy.levelChanged = true
			trophy.scoreIncrementTime = Date.now() + 200 // delay score increment by 0.2s
			trophy.scoreIncremented = false
			// For levels after the first, wait 2 seconds after score increment before changing level
			// For level 1, use the original timing
			if (level > 1) {
				trophy.nextLevelTime = null // Will be set after score increments
			} else {
				trophy.nextLevelTime = Date.now() + FADE_DURATION // change level after delay
			}
		}

		// Apply the delayed score increment once the delay has passed
		if (trophy.levelChanged && !trophy.scoreIncremented && trophy.scoreIncrementTime && Date.now() >= trophy.scoreIncrementTime) {
			completionScore++
			trophy.scoreIncremented = true
			// For levels after the first, set next level time to 2 seconds after score increment
			if (level > 1 && trophy.nextLevelTime === null) {
				trophy.nextLevelTime = Date.now() + 2000 // 2 seconds after score increment
			}
		}
		
		// Change level after the scheduled delay (no grey-ball fade)
		if (trophy.levelChanged && trophy.nextLevelTime && Date.now() >= trophy.nextLevelTime) {
			trophy = null
			pendingNextLevel = false
			// Mark that we've completed at least one level so future levels
			// can animate the ball into its starting spot.
			hasCompletedALevel = true
			// Tutorial only runs on level 1; mark it completed after finishing that level.
			if (level === 1 && !tutorialCompleted) {
				tutorialCompleted = true
				tutorialStep = 0
				updateTutorial()
			}
 			generateLevel()
 			return
 		}
		
		// When trophy fully exits, just remove it (grey ball fade already in progress)
		if (trophy.xPos < -trophy.radius * 2 && trophy.yPos < -trophy.radius * 2) {
			trophy = null
		}
	}
	
	// Draw the score first, then draw the trophy on top of it (z-order)
	drawCompletionScore()
	drawTrophy()
	drawFireworks()
}

function createFireworks(x, y, color = "blue") {
	// Create liquid explosion effect with particles
	let particleCount = 12
	let particleColor
	if (color === "red") {
		particleColor = "rgba(255, 0, 0, 1.0)"
	} else if (color === "white") {
		particleColor = "rgba(255, 255, 255, 1.0)"
	} else if (color === "gold") {
		particleColor = "rgba(255, 215, 0, 1.0)" // Gold
	} else {
		particleColor = "rgba(0, 0, 255, 1.0)" // Blue
	}
	
	for (let i = 0; i < particleCount; i++) {
		let angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.7
		let speed = 1.5 + Math.random() * 2 // Smaller, slower particles
		fireworks.push({
			x: x,
			y: y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed,
			life: 15 + Math.random() * 10, // Shorter lifetime
			maxLife: 15 + Math.random() * 10,
			color: particleColor,
			size: 3 + Math.random() * 3 // Larger particles
		})
	}
}

function drawFireworks() {
	// Save canvas state
	ctx.save()
	
	for (let i = fireworks.length - 1; i >= 0; i--) {
		let firework = fireworks[i]
		
		// Update position
		firework.x += firework.vx
		firework.y += firework.vy
		firework.vy += 0.15 // Gravity
		firework.vx *= 0.98 // Friction
		firework.life--
		
		// Draw particle with fading opacity
		let alpha = firework.life / firework.maxLife
		
		// Only draw if particle is still alive and alpha is positive
		if (alpha > 0 && firework.life > 0) {
			ctx.globalAlpha = alpha * 0.8 // Subtle effect
			ctx.fillStyle = firework.color
			ctx.beginPath()
			ctx.arc(firework.x, firework.y, firework.size * alpha, 0, Math.PI * 2)
			ctx.fill()
		}
		
		// Remove dead particles
		if (firework.life <= 0) {
			fireworks.splice(i, 1)
		}
	}
	
	// Restore canvas state (resets all properties including alpha, fillStyle, etc.)
	ctx.restore()
}

function drawBall() {
	let radius = getBallRadius()
	let x = ball.xPos
	let y = ball.yPos
	
	// Apply fade opacity
	ctx.save()
	ctx.globalAlpha = ball.fadeOpacity !== undefined ? ball.fadeOpacity : 1.0

	// Simple sphere with subtle gradient
	let gradient = ctx.createRadialGradient(
		x - radius * 0.5, y - radius * 0.5, 0,
		x, y, radius
	)
	gradient.addColorStop(0, "#b0b0b0")
	gradient.addColorStop(1, "#606060")
	
	ctx.beginPath()
	ctx.arc(x, y, radius, 0, 2 * Math.PI)
	ctx.fillStyle = gradient
	ctx.fill()

	ctx.restore()
}

function drawTargets() {
	for (let i=0; i<targetsRemaining.length; i++) {
		let target = targetsRemaining[i]
		let radius = getTargetRadius()
		let x = target.xPos
		let y = target.yPos
		
		// Get opacity (fade-in or default to 0 to prevent flashing)
		let opacity = 0
		if (target.fadeInOpacity !== undefined) {
			opacity = Math.max(0, Math.min(1.0, target.fadeInOpacity))
		}
		
		ctx.save()
		ctx.globalAlpha = opacity
		
		// Simple sphere with subtle gradient
		let gradient = ctx.createRadialGradient(
			x - radius * 0.5, y - radius * 0.5, 0,
			x, y, radius
		)
		gradient.addColorStop(0, "#3333ff")
		gradient.addColorStop(1, "#0000aa")
		
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.fillStyle = gradient
		ctx.fill()
		
		ctx.restore()
	}
}

function drawObstacles() {
	for (let i = 0; i < obstacles.length; i++) {
		let obstacle = obstacles[i]
		let radius = obstacle.radius
		let x = obstacle.xPos
		let y = obstacle.yPos
		
		// Get opacity (fade-in takes priority, then fade-out, then default to 0 to prevent flashing)
		// CRITICAL: Always default to 0 to prevent any flashing
		let opacity = 0
		
		// Emergency fallback: if fadeInOpacity is somehow still undefined, initialize it now
		if (obstacle.fadeInOpacity === undefined || obstacle.fadeInStartTime === undefined) {
			obstacle.fadeInOpacity = 0
			obstacle.fadeInStartTime = Date.now() + FADE_IN_DELAY
			opacity = 0
		} else if (!obstacle.fading) {
			// Use fade-in opacity if not fading out
			// CRITICAL: Only use fade-in opacity if it's been initialized and start time has passed
			if (obstacle.fadeInStartTime <= Date.now()) {
				opacity = Math.max(0, Math.min(1.0, obstacle.fadeInOpacity))
			} else {
				// If fade-in hasn't started yet, keep at 0
				opacity = 0
			}
		}
		
		// Fade-out takes priority over fade-in
		if (obstacle.fading && obstacle.fadeOpacity !== undefined) {
			opacity = Math.max(0, Math.min(1.0, obstacle.fadeOpacity))
		}
		
		ctx.save()
		ctx.globalAlpha = opacity
		
		// Simple sphere with subtle gradient
		let gradient = ctx.createRadialGradient(
			x - radius * 0.5, y - radius * 0.5, 0,
			x, y, radius
		)
		gradient.addColorStop(0, "#ff3333")
		gradient.addColorStop(1, "#aa0000")
		
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.fillStyle = gradient
		ctx.fill()
		
		ctx.restore()
	}
}

function drawStar() {
	if (!star) return
	
	let radius = star.radius
	let x = star.xPos
	let y = star.yPos
	
	// Initialize fade-in if missing
	if (star.fadeInOpacity === undefined || star.fadeInStartTime === undefined) {
		star.fadeInOpacity = 0
		star.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (star.fadeInOpacity < 1.0 && star.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - star.fadeInStartTime
		let fadeDuration = FADE_DURATION
		star.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, star.fadeInOpacity !== undefined ? star.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw white star (5-pointed) with bright white fill and outline
	ctx.fillStyle = "#ffffff"
	ctx.strokeStyle = "#000000"
	ctx.lineWidth = 3
	ctx.beginPath()
	
	let starPoints = 5
	let outerRadius = radius
	let innerRadius = radius * 0.4
	
	for (let i = 0; i < starPoints * 2; i++) {
		let angle = (Math.PI * i) / starPoints - Math.PI / 2
		let r = (i % 2 === 0) ? outerRadius : innerRadius
		let px = x + Math.cos(angle) * r
		let py = y + Math.sin(angle) * r
		if (i === 0) {
			ctx.moveTo(px, py)
		} else {
			ctx.lineTo(px, py)
		}
	}
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
	
	ctx.restore()
}

function drawSwitcher() {
	if (!switcher) return
	
	let radius = switcher.radius
	let x = switcher.xPos
	let y = switcher.yPos
	
	// Initialize fade-in if missing
	if (switcher.fadeInOpacity === undefined || switcher.fadeInStartTime === undefined) {
		switcher.fadeInOpacity = 0
		switcher.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (switcher.fadeInOpacity < 1.0 && switcher.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - switcher.fadeInStartTime
		let fadeDuration = FADE_DURATION
		switcher.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, switcher.fadeInOpacity !== undefined ? switcher.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw black background circle (no outline)
	ctx.fillStyle = "#000000"
	ctx.beginPath()
	ctx.arc(x, y, radius, 0, 2 * Math.PI)
	ctx.fill()
	
	// Draw two thick, curved white arrows forming an almost complete circle with gaps
	let circleRadius = radius * 0.5 // Radius of the circular path
	let arrowThickness = radius * 0.25 // Thickness of arrow body (thick and bold)
	let arrowHeadSize = radius * 0.3 // Size of arrowhead
	let gapSize = Math.PI * 0.25 // Gap between arrows (larger gap for better visibility)
	let arrowArcLength = (Math.PI * 2 - gapSize * 2) / 2 // Each arrow covers half the remaining circle
	
	// Top arrow: starts from left-middle, curves clockwise up and right, arrowhead points right
	// Left-middle is at 180 degrees, curves clockwise ending before the gap
	let topArrowStartAngle = Math.PI + gapSize / 2 // Start after gap at left-middle area
	let topArrowEndAngle = Math.PI * 2 - gapSize / 2 // End before gap at right-middle area
	
	// Bottom arrow: starts from right-middle, curves clockwise down and left, arrowhead points left
	// Right-middle area, curves clockwise ending before the gap at left-middle
	let bottomArrowStartAngle = gapSize / 2 // Start after gap at right-middle area
	let bottomArrowEndAngle = Math.PI - gapSize / 2 // End before gap at left-middle area
	
	ctx.strokeStyle = "#ffffff"
	ctx.fillStyle = "#ffffff"
	ctx.lineWidth = arrowThickness
	ctx.lineCap = "round"
	ctx.lineJoin = "round"
	
	// Draw top arrow
	ctx.save()
	ctx.translate(x, y)
	ctx.beginPath()
	ctx.arc(0, 0, circleRadius, topArrowStartAngle, topArrowEndAngle)
	ctx.stroke()
	
	// Draw top arrowhead (pointing right)
	let topArrowHeadX = Math.cos(topArrowEndAngle) * circleRadius
	let topArrowHeadY = Math.sin(topArrowEndAngle) * circleRadius
	ctx.save()
	ctx.translate(topArrowHeadX, topArrowHeadY)
	ctx.rotate(topArrowEndAngle + Math.PI / 2) // Point along the tangent
	ctx.beginPath()
	ctx.moveTo(0, 0)
	ctx.lineTo(-arrowHeadSize, -arrowHeadSize * 0.6)
	ctx.lineTo(arrowHeadSize, -arrowHeadSize * 0.6)
	ctx.closePath()
	ctx.fill()
	ctx.restore()
	ctx.restore()
	
	// Draw bottom arrow
	ctx.save()
	ctx.translate(x, y)
	ctx.beginPath()
	ctx.arc(0, 0, circleRadius, bottomArrowStartAngle, bottomArrowEndAngle)
	ctx.stroke()
	
	// Draw bottom arrowhead (pointing left)
	let bottomArrowHeadX = Math.cos(bottomArrowEndAngle) * circleRadius
	let bottomArrowHeadY = Math.sin(bottomArrowEndAngle) * circleRadius
	ctx.save()
	ctx.translate(bottomArrowHeadX, bottomArrowHeadY)
	ctx.rotate(bottomArrowEndAngle + Math.PI / 2) // Point along the tangent
	ctx.beginPath()
	ctx.moveTo(0, 0)
	ctx.lineTo(-arrowHeadSize, -arrowHeadSize * 0.6)
	ctx.lineTo(arrowHeadSize, -arrowHeadSize * 0.6)
	ctx.closePath()
	ctx.fill()
	ctx.restore()
	ctx.restore()
	
	ctx.restore()
}

function drawSkull() {
	if (!skull) return
	
	let radius = skull.radius
	let x = skull.xPos
	let y = skull.yPos
	
	// Initialize fade-in if missing
	if (skull.fadeInOpacity === undefined || skull.fadeInStartTime === undefined) {
		skull.fadeInOpacity = 0
		skull.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (skull.fadeInOpacity < 1.0 && skull.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - skull.fadeInStartTime
		let fadeDuration = FADE_DURATION
		skull.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, skull.fadeInOpacity !== undefined ? skull.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw white X
	ctx.strokeStyle = "#ffffff"
	ctx.fillStyle = "#ffffff"
	ctx.lineWidth = radius * 0.25
	ctx.lineCap = "round"
	
	// First diagonal line (top-left to bottom-right)
	ctx.beginPath()
	ctx.moveTo(x - radius * 0.5, y - radius * 0.5)
	ctx.lineTo(x + radius * 0.5, y + radius * 0.5)
	ctx.stroke()
	
	// Second diagonal line (top-right to bottom-left)
	ctx.beginPath()
	ctx.moveTo(x + radius * 0.5, y - radius * 0.5)
	ctx.lineTo(x - radius * 0.5, y + radius * 0.5)
	ctx.stroke()
	
	ctx.restore()
}

function drawTrophy() {
	if (!trophy) return
	
	let radius = trophy.radius
	let x = trophy.xPos
	let y = trophy.yPos
	
	// Get opacity (fade-in or default to 1.0)
	let opacity = trophy.fadeInOpacity !== undefined ? trophy.fadeInOpacity : 1.0
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw trophy in gold/yellow with gradient
	let gradient = ctx.createLinearGradient(x, y - radius, x, y + radius)
	gradient.addColorStop(0, "#ffed4e") // Lighter gold at top
	gradient.addColorStop(0.5, "#ffd700") // Gold in middle
	gradient.addColorStop(1, "#daa520") // Darker gold at bottom
	ctx.fillStyle = gradient
	ctx.strokeStyle = "#b8860b" // Dark gold for outline
	ctx.lineWidth = 3
	
	// Trophy base (bottom, wider and perfectly centered)
	let baseWidth = radius * 1.0
	let baseHeight = radius * 0.15
	let baseY = y + radius * 0.35
	ctx.beginPath()
	ctx.rect(x - baseWidth / 2, baseY, baseWidth, baseHeight)
	ctx.fill()
	ctx.stroke()
	
	// Trophy stem/pedestal (connects base to cup, perfectly centered)
	let stemWidth = radius * 0.3
	let stemHeight = radius * 0.2
	let stemY = y + radius * 0.15
	ctx.beginPath()
	ctx.rect(x - stemWidth / 2, stemY, stemWidth, stemHeight)
	ctx.fill()
	ctx.stroke()
	
	// Trophy cup/bowl (main body, perfectly symmetrical)
	let cupBottomY = stemY
	let cupTopY = y - radius * 0.3
	let cupBottomWidth = radius * 0.4
	let cupTopWidth = radius * 0.7
	let cupInnerTopWidth = radius * 0.4
	
	ctx.beginPath()
	// Start at bottom left
	ctx.moveTo(x - cupBottomWidth / 2, cupBottomY)
	// Left side curve (symmetric)
	ctx.quadraticCurveTo(
		x - cupTopWidth / 2, (cupBottomY + cupTopY) / 2,
		x - cupTopWidth / 2, cupTopY
	)
	// Top rim left
	ctx.lineTo(x - cupInnerTopWidth / 2, cupTopY)
	// Inner left edge
	ctx.lineTo(x - cupInnerTopWidth / 2, cupTopY + radius * 0.1)
	// Inner bottom curve (symmetric)
	ctx.quadraticCurveTo(x, cupTopY + radius * 0.15, x + cupInnerTopWidth / 2, cupTopY + radius * 0.1)
	// Inner right edge
	ctx.lineTo(x + cupInnerTopWidth / 2, cupTopY)
	// Top rim right
	ctx.lineTo(x + cupTopWidth / 2, cupTopY)
	// Right side curve (symmetric to left)
	ctx.quadraticCurveTo(
		x + cupTopWidth / 2, (cupBottomY + cupTopY) / 2,
		x + cupBottomWidth / 2, cupBottomY
	)
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
	
	// Trophy handles (perfectly symmetrical C-shaped handles)
	let handleRadius = radius * 0.2
	let handleXOffset = radius * 0.45
	let handleY = y - radius * 0.05
	let handleThickness = radius * 0.12
	
	// Left handle (C-shaped, opening to the right)
	ctx.beginPath()
	ctx.arc(x - handleXOffset, handleY, handleRadius, Math.PI * 0.5, Math.PI * 1.5, false)
	ctx.lineWidth = handleThickness
	ctx.lineCap = "round"
	ctx.stroke()
	
	// Right handle (C-shaped, opening to the left, perfectly mirrored)
	ctx.beginPath()
	ctx.arc(x + handleXOffset, handleY, handleRadius, Math.PI * 1.5, Math.PI * 0.5, false)
	ctx.stroke()
	
	// Star on top (perfectly centered, 5-pointed star)
	ctx.fillStyle = "#ffd700"
	ctx.strokeStyle = "#ffaa00"
	ctx.lineWidth = 2
	ctx.beginPath()
	let starX = x
	let starY = y - radius * 0.4
	let starOuterRadius = radius * 0.15
	let starInnerRadius = starOuterRadius * 0.5
	let starPoints = 5
	
	for (let i = 0; i < starPoints * 2; i++) {
		let angle = (Math.PI * i) / starPoints - Math.PI / 2
		let r = (i % 2 === 0) ? starOuterRadius : starInnerRadius
		let px = starX + Math.cos(angle) * r
		let py = starY + Math.sin(angle) * r
		if (i === 0) {
			ctx.moveTo(px, py)
		} else {
			ctx.lineTo(px, py)
		}
	}
	ctx.closePath()
	ctx.fill()
	ctx.stroke()
	
	ctx.restore()
}

function getScoreCenter() {
	let scoreTextX = canvas.width - 12
	let scoreTextY = 56
	ctx.save()
	ctx.font = "bold 56px Arial"
	ctx.textAlign = "right"
	let scoreMetrics = ctx.measureText(`${completionScore}`)
	let scoreWidth = scoreMetrics.width || 0
	let ascent = scoreMetrics.actualBoundingBoxAscent
	let descent = scoreMetrics.actualBoundingBoxDescent
	if (!Number.isFinite(ascent)) ascent = 56
	if (!Number.isFinite(descent)) descent = 0
	let left = scoreTextX - scoreWidth
	let right = scoreTextX
	let top = scoreTextY - ascent
	let bottom = scoreTextY + descent
	ctx.restore()
	return {
		x: (left + right) / 2,
		y: (top + bottom) / 2
	}
}

function drawCompletionScore() {
	ctx.font = "bold 56px Arial"
	let scoreText = `${completionScore}`
	
	// Draw text outline for better visibility
	ctx.strokeStyle = "black"
	ctx.lineWidth = 6
	ctx.lineJoin = "round"
	ctx.miterLimit = 2
	
	// Position at top right with padding
	ctx.textAlign = "right"
	let textX = canvas.width - 12
	let textY = 56

	// For the very first level only, fade in the score in sync with the grey ball.
	let scoreAlpha = 1.0
	if (initialIntroActive && !hasCompletedALevel) {
		let elapsed = Date.now() - initialIntroStartTime
		let fadeDuration = FADE_DURATION
		scoreAlpha = Math.min(1.0, Math.max(0.0, elapsed / fadeDuration))
	}
	
	ctx.save()
	ctx.globalAlpha = scoreAlpha
	
	// Draw outline
	ctx.strokeText(scoreText, textX, textY)
	
	// Draw fill text (match trophy gold color)
	ctx.fillStyle = "#ffd700"
	ctx.fillText(scoreText, textX, textY)
	
	ctx.restore()
	
	// Draw score increment indicator if active
	if (scoreIncrementDisplay && scoreIncrementDisplay.opacity > 0) {
		ctx.save()
		ctx.globalAlpha = scoreIncrementDisplay.opacity
		
		// Measure score text width to position increment indicator
		let scoreWidth = ctx.measureText(scoreText).width
		let incrementX = textX + scoreWidth + 15 // Position to the right of score
		let incrementY = textY
		
		// Draw increment text (smaller font)
		ctx.font = "bold 36px Arial"
		let incrementText = `+${scoreIncrementDisplay.amount}`
		
		// Draw outline
		ctx.strokeStyle = "black"
		ctx.lineWidth = 4
		ctx.strokeText(incrementText, incrementX, incrementY)
		
		// Draw fill (green for positive)
		ctx.fillStyle = "#00ff00"
		ctx.fillText(incrementText, incrementX, incrementY)
		
		ctx.restore()
		
		// Update opacity and time (updated each frame)
		const SCORE_INCREMENT_FADE_DURATION = 1.0 // seconds
		scoreIncrementDisplay.timeLeft -= MS_PER_FRAME / 1000 // Convert ms to seconds
		if (scoreIncrementDisplay.timeLeft <= 0) {
			scoreIncrementDisplay = null
		} else {
			// Fade out over time (linear fade)
			scoreIncrementDisplay.opacity = Math.max(0, scoreIncrementDisplay.timeLeft / SCORE_INCREMENT_FADE_DURATION)
		}
	}
}

function updateTutorial() {
	let tutorialOverlay = document.getElementById("tutorialOverlay")
	if (!tutorialOverlay || !canvas) return
	
	// Tutorial runs:
	// - Level 1: multi-step tutorial (fling, hit, switch).
	// - Level 2: single reminder text about switching.
	if ((level === 1 && (tutorialStep === 0 || tutorialCompleted)) ||
	    (level === 2 && tutorialStep === 0) ||
	    (level !== 1 && level !== 2)) {
		tutorialOverlay.style.opacity = "0"
		tutorialOverlay.style.visibility = "hidden"
		tutorialOverlay.textContent = ""
		return
	}
	
	let text = ""
	if (level === 1) {
		if (tutorialStep === 1) {
			text = "Fling the grey ball"
		} else if (tutorialStep === 2) {
			text = "Hit all the blue balls to win"
		} else if (tutorialStep === 3) {
			text = "Tap blue then red to switch them"
		}
	} else if (level === 2) {
		text = "Tap any two items to swap them"
	}

	// Set text and measure once for simple centered placement near the bottom.
	tutorialOverlay.textContent = text
	tutorialOverlay.style.visibility = "hidden"
	tutorialOverlay.offsetHeight // force reflow

	let padding = 40
	let textShadowBuffer = 20
	let measuredWidth = tutorialOverlay.offsetWidth || 300
	let measuredHeight = tutorialOverlay.offsetHeight || 30
	let textWidth = measuredWidth + textShadowBuffer * 2
	let textHeight = measuredHeight + textShadowBuffer * 2
	let textHalfWidth = textWidth / 2
	let textHalfHeight = textHeight / 2
	
	let topExclusionY = canvas.height * 0.2
	
	// Base position: horizontally centered, vertically relative to ball.
	let ballRadius = getBallRadius()
	let baseX = canvas.width / 2
	// Place the text three ball-radii (1.5 diameters) above the ball.
	let baseY = (ball?.yPos ?? (canvas.height - padding - textHalfHeight)) - (3 * ballRadius)

	// Center horizontally, clamp vertically inside safe region.
	let xPos = baseX
	let yPos = Math.max(topExclusionY + textHalfHeight + padding, Math.min(baseY, canvas.height - padding - textHalfHeight))

	// For level 1, remember the absolute position we actually used.
	if (level === 1) {
		tutorialLastX = xPos
		tutorialLastY = yPos
	}

	// For level 2, reuse the exact absolute position from level 1 if we have it.
	if (level === 2 && tutorialLastX !== null && tutorialLastY !== null) {
		xPos = tutorialLastX
		yPos = tutorialLastY
	}

	tutorialOverlay.style.left = xPos + "px"
	tutorialOverlay.style.top = yPos + "px"
	tutorialOverlay.style.opacity = "1"
	tutorialOverlay.style.visibility = "visible"
}

function isObjectCloseToObject(objectA, distance, objectB) {
  return (
    Math.abs(objectA.xPos - objectB.xPos) < distance && 
    Math.abs(objectA.yPos - objectB.yPos) < distance
  )
}

function resizeCanvas() {
	if (canvas && !isGeneratingLevel) {
		// Use window dimensions to avoid zoom issues with visualViewport
		// visualViewport can cause zoom when the keyboard appears/disappears
		canvas.width = window.innerWidth
		canvas.height = window.innerHeight
	}
}