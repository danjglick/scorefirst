// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
function getShim() { return (canvas?.width || window.innerWidth) / 10 }
function getBallRadius() { return (canvas?.width || window.innerWidth) / 20 }
function getTargetRadius() { return (canvas?.width || window.innerWidth) / 20 }
const SPECIAL_ITEM_COOLDOWN = 1000 // ms between activations for all special items
const FRICTION = .99
const FLING_DIVISOR = 2
const BALL_STOP_SPEED = 10 // Higher threshold so we treat the ball as "stopped" sooner
const TOUCH_TOLERANCE = 20 // Extra pixels for touch detection
const SPAWN_ANIMATION_DURATION = 700 // ms for ball spawn animation
const FADE_DURATION = 1000 // ms for fade animations
const FADE_IN_DELAY = 1000 // ms delay before starting fade-in (prevents flashing)
const TROPHY_PLACEMENT_DELAY = 1000 // ms delay before placing trophy (same as obstacle fade)
const TUTORIAL_FADE_DELAY = 2000 // ms delay before fading tutorial
const OBSTACLE_FADE_DELAY = 1000 // ms delay before fading obstacles
const BALL_MIN_CONTINUE_SPEED = 3 // If above this and path will clear all targets, don't auto-reset yet
const AUTO_RESET_DURATION = 1000 // ms for ball move-back + target fade-in
const SWAP_ANIMATION_DURATION = 350 // ms for swap position animation

let canvas;

// Active swap animations: array of { sprite, fromX, fromY, toX, toY, startTime }
let swapAnimations = []
let ctx;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0,
	isBeingFlung: false,
	fadeOpacity: 1.0
}
let wormholeLastTeleportTime = 0 // Track when ball last teleported through a wormhole
let wormholeCooldown = 1000 // Milliseconds to wait before allowing another teleport
let wormholeTeleportPending = null // { startTime: number, destX: number, destY: number, xVel: number, yVel: number }
let wormholeDisabledUntil = 0 // Timestamp when wormholes become available again (2 seconds after use)
let targets = []
let targetsRemaining = []
let obstacles = []
let star = null // White star that removes obstacles when hit (spawns starting level 6, cycles through items)
let switcher = null // White loop symbol that switches all red and blue balls when hit (spawns starting level 6, cycles through items)
let cross = null // White cross/X mark that doubles obstacles when hit (spawns starting level 6, cycles through items)
let lightning = null // Orange lightning bolt that gives pass-through (spawns starting level 6, cycles through items)
let lightningImage = null // Image for lightning bolt
let bush = null // Green bush that slows ball and gives green border (spawns starting level 6, cycles through items)
let wormhole = null // Array of two purple wormholes that teleport ball between them (spawns starting level 6, cycles through items)
let starHitThisTry = false // Track whether ball was colliding with star on the previous frame (for hit detection)
let crossHitThisTry = false // Track whether ball was colliding with cross on the previous frame (for hit detection)
let starLastHitTime = 0 // Timestamp of last star activation (cooldown)
let switcherLastHitTime = 0 // Timestamp of last switcher activation (cooldown)
let crossLastHitTime = 0 // Timestamp of last cross activation (cooldown)
let lightningLastHitTime = 0 // Timestamp of last lightning activation (cooldown)
let bushLastHitTime = 0 // Timestamp of last bush activation (cooldown)
let currentLevelSpecialItem = null // Track which special item type was selected for the current level
let currentLevelSpecialItems = [] // Track which special items were selected for current level (for when 2 items spawn)
let lightningEffectActive = false // Track if lightning effect is currently active (lasts for rest of try)
let bushEffectActive = false // Track if bush effect is currently active (lasts for rest of try)
let wormholeEffectActive = false // Track if wormhole effect (purple border) is currently active (lasts for rest of try)
let ballStoppedByBushEffect = false // Track if ball was stopped by bush effect (prevents auto-reset until user flings again)
let trophy = null // Trophy that appears after collecting all targets
let startingDoor = null // Small door that appears behind character at level start
let savedTargets = [] // Saved positions for retry
let savedObstacles = [] // Saved positions for retry
let savedBall = null // Saved ball position for retry
let savedStar = null // Saved star position for retry
let savedSwitcher = null // Saved switcher position for retry
let savedCross = null // Saved cross position for retry
let savedLightning = null // Saved lightning position for retry
let savedBush = null // Saved bush position for retry
let savedWormhole = null // Saved wormhole positions for retry
let isConvertingObstacle = false
let selectedForConversion = null // { type: 'obstacle' | 'target' | 'star', index: number }
let touch1 = {
	xPos: 0,
	yPos: 0
}
let ballTappedForSelection = false // Track if ball was tapped (for potential selection after touchend)
let touchMoved = false // Track if user moved their finger (indicates a fling, not a tap)
// Track where the last target was collected so we can place the trophy there
let lastTargetX = null
let lastTargetY = null
// Track previous ball position so we can animate to the next level's starting spot
let previousBallX = null
let previousBallY = null
// Track whether we've already completed at least one level (so we can skip
// the spawn animation for the very first level).
let hasCompletedALevel = false
// Tutorial steps:
// 1 = "Fling the grey ball"
// 2 = "Hit all the blue balls ..."
// 3 = "Swap any two items by tapping them" (still level 1)
// 4 = "Think carefully and aim true!" (shown on level 2)
let tutorialStep = 0 // 0 = off
let tutorialCompleted = true // Tutorial disabled
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
// Track obstacle collisions to detect stuck bouncing
let obstacleCollisionTimes = [] // Array of timestamps for recent obstacle collisions
const MAX_OBSTACLE_COLLISIONS = 15 // Max collisions in time window before auto-reset
const OBSTACLE_COLLISION_WINDOW = 2000 // Time window in ms (2 seconds)
// Track when ball slowed below BALL_STOP_SPEED (for conservative isBeingFlung reset)
let ballSlowBelowStopSpeedTime = null // Timestamp when ball first slowed below BALL_STOP_SPEED
const BALL_SLOW_CONFIRMATION_TIME = 100 // ms to wait before confirming ball is actually stopped
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
let savedCompletionScore = 0 // Score at start of level (for auto-reset)
let scoreIncrementDisplay = null // { opacity: 1.0, timeLeft: 1.0, amount: 1 } for showing +1 indicator
let level = 0
let gameLoopTimeout = null
let fireworks = []
let obstacleExplosionTimeout = null
let tutorialExplosionTimeout = null
let nextLevelTimeout = null
let isGeneratingLevel = false
let pendingNextLevel = false
let ballHiddenForNextLevel = false // Track if ball is hidden waiting for next level to start
let ballFadeOutStartTime = null // Track when ball fade-out started
let doorFadeOutStartTime = null // Track when door fade-out started

// Track if user has ever executed a swap (for level 3 hint)
let hasExecutedSwap = false
let level3HintPosition = null // Random position for the swap hint on level 3
let level3HintFadeInStartTime = null // When the hint should start fading in
let level3HintFadeOutStartTime = null // When the hint should start fading out
let level2HintPosition = null // Random position for the level 2 hint
let level2HintFadeInStartTime = null // When the level 2 hint should start fading in
let level2HintFadeOutStartTime = null // When the hint should start fading out
let level1HintPosition = null // Random position for the level 1 hint
let level1BallFadeInTime = null // When the ball faded in on level 1
let level1HintFadeOutStartTime = null // When the hint should start fading out
let level10HintPosition = null // Random position for the level 10 hint
let level10HintFadeInStartTime = null // When the hint should start fading in
let level10HintFadeOutStartTime = null // When the hint should start fading out

// Victory drawing - user can draw on screen when trophy is displayed
let victoryDrawingStrokes = [] // Array of completed strokes, each stroke is an array of {x, y} points
let currentVictoryStroke = null // Current stroke being drawn (array of points)
let victoryTouchPos = null // Current touch position for electric line to ball

function initializeGame() {
	canvas = document.getElementById("canvas")
	resizeCanvas()
	ctx = canvas.getContext('2d')
	
	// Load lightning image
	lightningImage = new Image()
	lightningImage.src = 'images/lightning.png'
	
	// Start the very first level - ball will fade in after level elements
	initialIntroActive = true
	initialIntroStartTime = Date.now()
	ball.fadeOpacity = 0.0
	// Ball will fade in 1 second after the door (which fades in 1 second after targets/obstacles)
	ball.fadeInStartTime = Date.now() + FADE_IN_DELAY + FADE_DURATION * 2
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
	// Reset shotActive for new levels (not retries) to prevent auto-reset from triggering
	if (!isRetry) {
		shotActive = false
		obstacleCollisionTimes = [] // Reset obstacle collision tracking
		ballSlowBelowStopSpeedTime = null // Reset ball slow tracking
		// Reset level 3 hint position so it gets recalculated for the new level
		level3HintPosition = null
		level3HintFadeInStartTime = null // Reset fade-in start time for new level
		level3HintFadeOutStartTime = null // Reset fade-out start time for new level
		// Reset level 2 hint position so it gets recalculated for the new level
		level2HintPosition = null
		level2HintFadeInStartTime = null // Reset fade-in start time for new level
		level2HintFadeOutStartTime = null // Reset fade-out start time for new level
		// Reset level 1 hint position so it gets recalculated for the new level
		level1HintPosition = null
		level1BallFadeInTime = null // Reset ball fade-in time for new level
		level1HintFadeOutStartTime = null // Reset fade-out start time for new level
		// Reset level 10 hint position so it gets recalculated for the new level
		level10HintPosition = null
		level10HintFadeInStartTime = null // Reset fade-in start time for new level
		level10HintFadeOutStartTime = null // Reset fade-out start time for new level
	}
	
	// Check tries before resetting - if retrying with tries > 0, restore saved positions
	let shouldRestorePositions = isRetry && !fewerSprites && tries > 0
	
	// Calculate a single fade-in start time for all level elements to ensure they fade in together
	// Level 1: wait FADE_IN_DELAY before fading in (score also fading in)
	// Level 2+: no delay, fade in immediately
	let levelFadeInDelay = level >= 1 ? 0 : FADE_IN_DELAY
	let levelFadeInStartTime = Date.now() + levelFadeInDelay
	
	// Check if ball was hidden (from hitting door) - if so, skip animation
	let ballWasHidden = ball && ball.fadeOpacity === 0
	
	// Remember the previous ball position so we can animate into the next level's
	// starting spot — but ONLY after the first level has been completed.
	// Don't save previous position if ball was hidden (from door hit) - we want it to just appear
	if (ball && !isRetry && hasCompletedALevel && !ballWasHidden) {
		previousBallX = ball.xPos
		previousBallY = ball.yPos
	} else if (!ball || ballWasHidden) {
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
		// Set fade-in start time for all targets and obstacles to ensure they fade in together
		for (let i = 0; i < targets.length; i++) {
			targets[i].fadeInOpacity = 0
			targets[i].fadeInStartTime = levelFadeInStartTime
		}
		// Also set fade-in for targetsRemaining (which is a copy used for rendering)
		for (let i = 0; i < targetsRemaining.length; i++) {
			targetsRemaining[i].fadeInOpacity = 0
			targetsRemaining[i].fadeInStartTime = levelFadeInStartTime
		}
		for (let i = 0; i < obstacles.length; i++) {
			obstacles[i].fadeInOpacity = 0
			obstacles[i].fadeInStartTime = levelFadeInStartTime
		}
		placeBall()
		
		// Create starting door behind character (only on new levels, not retries)
		if (!isRetry) {
			let ballRadius = getBallRadius()
			// Level 1: door fades in 1 second after targets/obstacles (score also fading in)
			// Level 2+: door fades in 1 second after targets/obstacles
			let doorFadeDelay = FADE_DURATION
			startingDoor = {
				xPos: ball.xPos,
				yPos: ball.yPos,
				radius: ballRadius * 1.5, // Bigger than the ball so edges are visible
				fadeInOpacity: 0,
				fadeInStartTime: levelFadeInStartTime + doorFadeDelay,
				fadeOutStartTime: null
			}
		} else {
			// Clear starting door on retries
			startingDoor = null
		}
		// Reset all special items before potentially placing a new one
		star = null
		switcher = null
		cross = null
		lightning = null
		bush = null
		wormhole = null
		// Reset lightning, bush, and wormhole effects
		lightningEffectActive = false
		bushEffectActive = false
		wormholeEffectActive = false
		ballStoppedByBushEffect = false
		// Reset wormhole teleport cooldown and pending teleport
		wormholeLastTeleportTime = 0
		wormholeTeleportPending = null
		wormholeDisabledUntil = 0
		// Spawn special items per level starting at level 6
		// First cycle: one item per level, randomly cycling through all items
		// After all items shown once: two items per level
		if (level >= 6) {
			// For new levels, reset the current level's special item types
			if (!fewerSprites) {
				currentLevelSpecialItem = null
				currentLevelSpecialItems = []
			}
			// If we have saved items for this level, use them (for retries with fewerSprites)
			if (currentLevelSpecialItems.length > 0) {
				// Place all saved items for this level
				for (let item of currentLevelSpecialItems) {
					if (item === 'star') {
						placeStar()
					} else if (item === 'switcher') {
						placeSwitcher()
					} else if (item === 'cross') {
						placeCross()
					} else if (item === 'lightning') {
						placeLightning()
					} else if (item === 'bush') {
						placeBush()
					} else if (item === 'wormhole') {
						placeWormholes()
					}
				}
			} else if (currentLevelSpecialItem) {
				// Legacy single item support
				if (currentLevelSpecialItem === 'star') {
					placeStar()
				} else if (currentLevelSpecialItem === 'switcher') {
					placeSwitcher()
				} else if (currentLevelSpecialItem === 'cross') {
					placeCross()
				} else if (currentLevelSpecialItem === 'lightning') {
					placeLightning()
				} else if (currentLevelSpecialItem === 'bush') {
					placeBush()
				} else if (currentLevelSpecialItem === 'wormhole') {
					placeWormholes()
				}
			} else {
				// Pick one random special item for this level
				const allItems = ['star', 'switcher', 'cross', 'lightning', 'bush', 'wormhole']
				const randomIndex = Math.floor(Math.random() * allItems.length)
				const selectedItem = allItems[randomIndex]
				
				currentLevelSpecialItem = selectedItem
				currentLevelSpecialItems = [selectedItem]
				
				// Place the selected item
				if (selectedItem === 'star') {
					placeStar()
				} else if (selectedItem === 'switcher') {
					placeSwitcher()
				} else if (selectedItem === 'cross') {
					placeCross()
				} else if (selectedItem === 'lightning') {
					placeLightning()
				} else if (selectedItem === 'bush') {
					placeBush()
				} else if (selectedItem === 'wormhole') {
					placeWormholes()
				}
			}
		}
		
		// Set fade-in start time for all special items to ensure they fade in together with obstacles and targets
		if (lightning) {
			lightning.fadeInOpacity = 0
			lightning.fadeInStartTime = levelFadeInStartTime
		}
		if (bush) {
			bush.fadeInOpacity = 0
			bush.fadeInStartTime = levelFadeInStartTime
		}
		if (wormhole) {
			for (let i = 0; i < wormhole.length; i++) {
				wormhole[i].fadeInOpacity = 0
				wormhole[i].fadeInStartTime = levelFadeInStartTime
			}
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
		savedCross = cross ? JSON.parse(JSON.stringify(cross)) : null
		savedLightning = lightning ? JSON.parse(JSON.stringify(lightning)) : null
		savedBush = bush ? JSON.parse(JSON.stringify(bush)) : null
		savedWormhole = wormhole ? JSON.parse(JSON.stringify(wormhole)) : null
		savedCompletionScore = completionScore
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
			// Restore special items and track the type
			star = savedStar ? JSON.parse(JSON.stringify(savedStar)) : null
			switcher = savedSwitcher ? JSON.parse(JSON.stringify(savedSwitcher)) : null
			cross = savedCross ? JSON.parse(JSON.stringify(savedCross)) : null
			// Update currentLevelSpecialItem and currentLevelSpecialItems based on what was restored
			currentLevelSpecialItems = []
			if (star) {
				currentLevelSpecialItem = 'star'
				currentLevelSpecialItems.push('star')
			}
			if (switcher) {
				if (!currentLevelSpecialItem) currentLevelSpecialItem = 'switcher'
				currentLevelSpecialItems.push('switcher')
			}
			if (cross) {
				if (!currentLevelSpecialItem) currentLevelSpecialItem = 'cross'
				currentLevelSpecialItems.push('cross')
			}
			if (lightning) {
				if (!currentLevelSpecialItem) currentLevelSpecialItem = 'lightning'
				currentLevelSpecialItems.push('lightning')
			}
			if (bush) {
				if (!currentLevelSpecialItem) currentLevelSpecialItem = 'bush'
				currentLevelSpecialItems.push('bush')
			}
			if (wormhole) {
				if (!currentLevelSpecialItem) currentLevelSpecialItem = 'wormhole'
				currentLevelSpecialItems.push('wormhole')
			}
			// Reset lightning and bush effects
			lightningEffectActive = false
			bushEffectActive = false
			ballStoppedByBushEffect = false
		} else {
			// Generate new positions (first retry or no saved positions)
			placeTargets()
			placeObstacles()
			// Set fade-in start time for all targets and obstacles to ensure they fade in together
			for (let i = 0; i < targets.length; i++) {
				targets[i].fadeInOpacity = 0
				targets[i].fadeInStartTime = levelFadeInStartTime
			}
			// Also set fade-in for targetsRemaining (which is a copy used for rendering)
			for (let i = 0; i < targetsRemaining.length; i++) {
				targetsRemaining[i].fadeInOpacity = 0
				targetsRemaining[i].fadeInStartTime = levelFadeInStartTime
			}
			for (let i = 0; i < obstacles.length; i++) {
				obstacles[i].fadeInOpacity = 0
				obstacles[i].fadeInStartTime = levelFadeInStartTime
			}
			placeBall()
			// Reset all special items before potentially placing a new one
			star = null
			switcher = null
			cross = null
			lightning = null
			bush = null
			wormhole = null
			// Reset lightning and bush effects
			lightningEffectActive = false
			bushEffectActive = false
			ballStoppedByBushEffect = false
			// Spawn special items per level starting at level 6
			// For retries, use the same item types that were selected for this level
			if (level >= 6) {
				// Use the current level's special items (determined on first attempt)
				if (currentLevelSpecialItems.length > 0) {
					for (let item of currentLevelSpecialItems) {
						if (item === 'star') {
							placeStar()
						} else if (item === 'switcher') {
							placeSwitcher()
						} else if (item === 'cross') {
							placeCross()
						} else if (item === 'lightning') {
							placeLightning()
						} else if (item === 'bush') {
							placeBush()
						} else if (item === 'wormhole') {
							placeWormholes()
						}
					}
				} else if (currentLevelSpecialItem) {
					// Legacy single item support
					if (currentLevelSpecialItem === 'star') {
						placeStar()
					} else if (currentLevelSpecialItem === 'switcher') {
						placeSwitcher()
					} else if (currentLevelSpecialItem === 'cross') {
						placeCross()
					} else if (currentLevelSpecialItem === 'lightning') {
						placeLightning()
					} else if (currentLevelSpecialItem === 'bush') {
						placeBush()
					} else if (currentLevelSpecialItem === 'wormhole') {
						placeWormholes()
					}
				}
			}
			
			// Set fade-in start time for all special items to ensure they fade in together with obstacles and targets
			if (lightning) {
				lightning.fadeInOpacity = 0
				lightning.fadeInStartTime = levelFadeInStartTime
			}
			if (bush) {
				bush.fadeInOpacity = 0
				bush.fadeInStartTime = levelFadeInStartTime
			}
			if (wormhole) {
				for (let i = 0; i < wormhole.length; i++) {
					wormhole[i].fadeInOpacity = 0
					wormhole[i].fadeInStartTime = levelFadeInStartTime
				}
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
			savedCross = cross ? JSON.parse(JSON.stringify(cross)) : null
			savedLightning = lightning ? JSON.parse(JSON.stringify(lightning)) : null
			savedCompletionScore = completionScore
		}
	}
	targetsRemaining = JSON.parse(JSON.stringify(targets))
	// For new levels (not retries), ensure fade-in times are set consistently
	if (!isRetry) {
		for (let i = 0; i < targetsRemaining.length; i++) {
			targetsRemaining[i].fadeInOpacity = 0
			targetsRemaining[i].fadeInStartTime = levelFadeInStartTime
		}
		for (let i = 0; i < obstacles.length; i++) {
			obstacles[i].fadeInOpacity = 0
			obstacles[i].fadeInStartTime = levelFadeInStartTime
		}
	}
	fireworks = []
	// Reset victory drawing for new level
	victoryDrawingStrokes = []
	currentVictoryStroke = null
	victoryTouchPos = null
	// Don't reset star here - it's placed after obstacles/ball, so reset it before placement
	trophy = null // Reset trophy for new level
	// Don't reset startingDoor here - it only appears on new levels, not retries
	pendingNextLevel = false
	autoResetActive = false

	// Hide any trophy hint overlay when starting a new level
	let existingHint = document.getElementById("trophyHintOverlay")
	if (existingHint) {
		existingHint.style.visibility = "hidden"
		existingHint.style.opacity = "0"
	}
 
	// Initialize ball fade-in - ball fades in 1 second after door
	// Level 1: targets at 1s, door at 2s, ball at 3s
	// Level 2+: targets at 0s, door at 1s, ball at 2s
	let ballFadeDelay = level === 1 ? FADE_IN_DELAY + FADE_DURATION * 2 : FADE_DURATION * 2
	if (ball && !wormholeTeleportPending) {
		if (ballWasHidden || !isRetry) {
			// New level or coming from door hit - start ball at opacity 0 and fade in after door
			ball.fadeOpacity = 0
			ball.fadeInStartTime = Date.now() + ballFadeDelay
		} else {
			// Retry - keep ball visible
			ball.fadeOpacity = 1.0
		}
	}

	// If this is a new level AFTER the first completion (not a retry) and we know
	// where the ball was before, animate the ball moving from its previous position
	// into the new starting spot. BUT skip animation if ball was hidden (from door hit).
	// Start spawn animation after door has faded in
	if (!isRetry && hasCompletedALevel && previousBallX !== null && previousBallY !== null && !ballWasHidden) {
		// Store the spawn animation state on the ball
		ball.spawnFromX = previousBallX
		ball.spawnFromY = previousBallY
		ball.spawnToX = ball.xPos
		ball.spawnToY = ball.yPos
		// Start spawn animation at the same time as ball fade-in (after door finishes)
		ball.spawnStartTime = Date.now() + ballFadeDelay
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
	crossHitThisTry = false // Reset cross hit flag for new try
	// Initialize or clear tutorial for this level
	// Tutorial disabled - always set to 0
	tutorialStep = 0
	updateTutorial()
	if (gameLoopTimeout !== null) {
		clearTimeout(gameLoopTimeout)
		gameLoopTimeout = null
	}
	// Draw immediately so UI (level indicator) doesn't "flash" during the 100ms restart delay
	// CRITICAL: Ensure all sprites start at opacity 0 and have fade-in initialized before first draw
	// Level 1: wait FADE_IN_DELAY; Level 2+: no delay
	let fadeInStartTime = Date.now() + (level > 1 ? 0 : FADE_IN_DELAY)
	for (let i = 0; i < obstacles.length; i++) {
		obstacles[i].fadeInOpacity = 0
		obstacles[i].fadeInStartTime = fadeInStartTime
	}
	// Ensure all targets have fade-in initialized  
	for (let i = 0; i < targetsRemaining.length; i++) {
		targetsRemaining[i].fadeInOpacity = 0
		targetsRemaining[i].fadeInStartTime = fadeInStartTime
	}
	// Also update the targets array to match (for consistency)
	for (let i = 0; i < targets.length; i++) {
		targets[i].fadeInOpacity = 0
		targets[i].fadeInStartTime = fadeInStartTime
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
	// Ensure cross has fade-in initialized
	if (cross) {
		cross.fadeInOpacity = 0
		cross.fadeInStartTime = fadeInStartTime
	}
	// Ensure lightning, bush, and wormhole have fade-in initialized
	if (lightning) {
		lightning.fadeInOpacity = 0
		lightning.fadeInStartTime = fadeInStartTime
	}
	if (bush) {
		bush.fadeInOpacity = 0
		bush.fadeInStartTime = fadeInStartTime
	}
	if (wormhole) {
		for (let i = 0; i < wormhole.length; i++) {
			wormhole[i].fadeInOpacity = 0
			wormhole[i].fadeInStartTime = fadeInStartTime
		}
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
	updateSwapAnimations()
	draw()
	gameLoopTimeout = setTimeout(loopGame, MS_PER_FRAME)
}

// Start a swap animation for a sprite
function startSwapAnimation(sprite, fromX, fromY, toX, toY) {
	// Mark that user has executed a swap (for level 3 hint)
	hasExecutedSwap = true
	// Remove any existing animation for this sprite
	swapAnimations = swapAnimations.filter(a => a.sprite !== sprite)
	// Add new animation
	swapAnimations.push({
		sprite: sprite,
		fromX: fromX,
		fromY: fromY,
		toX: toX,
		toY: toY,
		startTime: Date.now()
	})
	// Set final position immediately (for collision detection)
	sprite.xPos = toX
	sprite.yPos = toY
}

// Update and clean up completed swap animations
function updateSwapAnimations() {
	let now = Date.now()
	swapAnimations = swapAnimations.filter(a => {
		return (now - a.startTime) < SWAP_ANIMATION_DURATION
	})
}

// Get the visual position of a sprite (animated if swapping, otherwise actual position)
function getSwapAnimatedPosition(sprite) {
	let anim = swapAnimations.find(a => a.sprite === sprite)
	if (!anim) {
		return { x: sprite.xPos, y: sprite.yPos }
	}
	
	let elapsed = Date.now() - anim.startTime
	let t = Math.min(1.0, elapsed / SWAP_ANIMATION_DURATION)
	// Ease out cubic
	t = 1 - Math.pow(1 - t, 3)
	
	return {
		x: anim.fromX + (anim.toX - anim.fromX) * t,
		y: anim.fromY + (anim.toY - anim.fromY) * t
	}
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
	
	// Convert obstacle to target (at obstacle's position, but animate from target's position)
	let newTarget = {
		xPos: obstacleX,
		yPos: obstacleY,
		fadeInOpacity: 1.0, // Instantly visible
		fadeInStartTime: Date.now() // Already started
	}
	targetsRemaining.push(newTarget)
	// Animate the new target from where the old target was
	startSwapAnimation(newTarget, targetX, targetY, obstacleX, obstacleY)
	
	// Convert target to obstacle (at target's position, but animate from obstacle's position)
	let newObstacle = {
		xPos: targetX,
		yPos: targetY,
		radius: targetRadius,
		fadeInOpacity: 1.0, // Instantly visible
		fadeInStartTime: Date.now() // Already started
	}
	obstacles.push(newObstacle)
	// Animate the new obstacle from where the old obstacle was
	startSwapAnimation(newObstacle, obstacleX, obstacleY, targetX, targetY)
	
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
	
	// Swap positions with animation
	startSwapAnimation(star, starX, starY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, starX, starY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, starX, starY)
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
	
	// Swap positions with animation
	startSwapAnimation(star, starX, starY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, starX, starY)
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapCrossAndTarget(targetIndex) {
	if (!cross) return
	
	let crossX = cross.xPos
	let crossY = cross.yPos
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
	
	// Swap positions with animation
	startSwapAnimation(cross, crossX, crossY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, crossX, crossY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, crossX, crossY)
	}
	
	// Ensure items are instantly visible
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapCrossAndObstacle(obstacleIndex) {
	if (!cross) return
	
	let crossX = cross.xPos
	let crossY = cross.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions with animation
	startSwapAnimation(cross, crossX, crossY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, crossX, crossY)
	
	// Ensure items are instantly visible
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapStarAndCross() {
	if (!star || !cross) return
	
	let starX = star.xPos
	let starY = star.yPos
	let crossX = cross.xPos
	let crossY = cross.yPos
	
	// Swap positions with animation
	startSwapAnimation(star, starX, starY, crossX, crossY)
	startSwapAnimation(cross, crossX, crossY, starX, starY)
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapStarAndSwitcher() {
	if (!star || !switcher) return
	
	let starX = star.xPos
	let starY = star.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions with animation
	startSwapAnimation(star, starX, starY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, starX, starY)
	
	// Ensure items are instantly visible
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapCrossAndSwitcher() {
	if (!cross || !switcher) return
	
	let crossX = cross.xPos
	let crossY = cross.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions with animation
	startSwapAnimation(cross, crossX, crossY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, crossX, crossY)
	
	// Ensure items are instantly visible
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
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
	
	// Swap positions with animation
	startSwapAnimation(switcher, switcherX, switcherY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, switcherX, switcherY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, switcherX, switcherY)
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
	
	// Swap positions with animation
	startSwapAnimation(switcher, switcherX, switcherY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, switcherX, switcherY)
	
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
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, ballX, ballY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, ballX, ballY)
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
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, ballX, ballY)
	
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
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, starX, starY)
	startSwapAnimation(star, starX, starY, ballX, ballY)
	
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
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, ballX, ballY)
	
	// Ensure switcher is instantly visible
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndCross() {
	if (!cross) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let crossX = cross.xPos
	let crossY = cross.yPos
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, crossX, crossY)
	startSwapAnimation(cross, crossX, crossY, ballX, ballY)
	
	// Ensure cross is instantly visible
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndLightning() {
	if (!lightning) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, lightningX, lightningY)
	startSwapAnimation(lightning, lightningX, lightningY, ballX, ballY)
	
	// Ensure lightning is instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapLightningAndTarget(targetIndex) {
	if (!lightning) return
	
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
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
	
	// Swap positions with animation
	startSwapAnimation(lightning, lightningX, lightningY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, lightningX, lightningY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, lightningX, lightningY)
	}
	
	// Ensure items are instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapLightningAndObstacle(obstacleIndex) {
	if (!lightning) return
	
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions with animation
	startSwapAnimation(lightning, lightningX, lightningY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, lightningX, lightningY)
	
	// Ensure items are instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapLightningAndStar() {
	if (!lightning || !star) return
	
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	let starX = star.xPos
	let starY = star.yPos
	
	// Swap positions with animation
	startSwapAnimation(lightning, lightningX, lightningY, starX, starY)
	startSwapAnimation(star, starX, starY, lightningX, lightningY)
	
	// Ensure items are instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapLightningAndSwitcher() {
	if (!lightning || !switcher) return
	
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions with animation
	startSwapAnimation(lightning, lightningX, lightningY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, lightningX, lightningY)
	
	// Ensure items are instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapLightningAndCross() {
	if (!lightning || !cross) return
	
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	let crossX = cross.xPos
	let crossY = cross.yPos
	
	// Swap positions with animation
	startSwapAnimation(lightning, lightningX, lightningY, crossX, crossY)
	startSwapAnimation(cross, crossX, crossY, lightningX, lightningY)
	
	// Ensure items are instantly visible
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBallAndBush() {
	if (!bush) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let bushX = bush.xPos
	let bushY = bush.yPos
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, bushX, bushY)
	startSwapAnimation(bush, bushX, bushY, ballX, ballY)
	
	// Ensure bush is instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBushAndTarget(targetIndex) {
	if (!bush) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array
	let targetInTargets = null
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, bushX, bushY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, bushX, bushY)
	}
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBushAndObstacle(obstacleIndex) {
	if (!bush) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, bushX, bushY)
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBushAndStar() {
	if (!bush || !star) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let starX = star.xPos
	let starY = star.yPos
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, starX, starY)
	startSwapAnimation(star, starX, starY, bushX, bushY)
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBushAndSwitcher() {
	if (!bush || !switcher) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, bushX, bushY)
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBushAndCross() {
	if (!bush || !cross) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let crossX = cross.xPos
	let crossY = cross.yPos
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, crossX, crossY)
	startSwapAnimation(cross, crossX, crossY, bushX, bushY)
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBushAndLightning() {
	if (!bush || !lightning) return
	
	let bushX = bush.xPos
	let bushY = bush.yPos
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	
	// Swap positions with animation
	startSwapAnimation(bush, bushX, bushY, lightningX, lightningY)
	startSwapAnimation(lightning, lightningX, lightningY, bushX, bushY)
	
	// Ensure items are instantly visible
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapBallAndWormhole(wormholeIndex) {
	if (!wormhole || wormhole.length === 0) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let whX = wh.xPos
	let whY = wh.yPos
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, whX, whY)
	startSwapAnimation(wh, whX, whY, ballX, ballY)
	
	// Ensure wormhole is instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapBallAndTrophy() {
	if (!trophy) return
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	let trophyX = trophy.xPos
	let trophyY = trophy.yPos
	
	// Swap positions with animation
	startSwapAnimation(ball, ballX, ballY, trophyX, trophyY)
	startSwapAnimation(trophy, trophyX, trophyY, ballX, ballY)
	
	// Ensure trophy is instantly visible
	trophy.fadeInOpacity = 1.0
	trophy.fadeInStartTime = Date.now()
	
	// Reset ball velocity when swapping
	ball.xVel = 0
	ball.yVel = 0
	ball.isBeingFlung = false
	
	selectedForConversion = null
}

function swapWormholeAndTarget(targetIndex, wormholeIndex) {
	if (!wormhole || wormhole.length === 0) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let target = targetsRemaining[targetIndex]
	let targetX = target.xPos
	let targetY = target.yPos
	
	// Find corresponding target in targets array
	let targetInTargets = null
	for (let i = 0; i < targets.length; i++) {
		let t = targets[i]
		let stillRemaining = targetsRemaining.some(tr => 
			Math.abs(tr.xPos - t.xPos) < 0.5 && Math.abs(tr.yPos - t.yPos) < 0.5
		)
		if (stillRemaining && Math.abs(t.xPos - targetX) < 0.5 && Math.abs(t.yPos - targetY) < 0.5) {
			targetInTargets = t
			break
		}
	}
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, targetX, targetY)
	startSwapAnimation(target, targetX, targetY, whX, whY)
	if (targetInTargets) {
		startSwapAnimation(targetInTargets, targetX, targetY, whX, whY)
	}
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	target.fadeInOpacity = 1.0
	target.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndObstacle(obstacleIndex, wormholeIndex) {
	if (!wormhole || wormhole.length === 0) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let obstacle = obstacles[obstacleIndex]
	let obstacleX = obstacle.xPos
	let obstacleY = obstacle.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, obstacleX, obstacleY)
	startSwapAnimation(obstacle, obstacleX, obstacleY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	obstacle.fadeInOpacity = 1.0
	obstacle.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndStar(wormholeIndex) {
	if (!wormhole || wormhole.length === 0 || !star) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let starX = star.xPos
	let starY = star.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, starX, starY)
	startSwapAnimation(star, starX, starY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	star.fadeInOpacity = 1.0
	star.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndSwitcher(wormholeIndex) {
	if (!wormhole || wormhole.length === 0 || !switcher) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let switcherX = switcher.xPos
	let switcherY = switcher.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, switcherX, switcherY)
	startSwapAnimation(switcher, switcherX, switcherY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	switcher.fadeInOpacity = 1.0
	switcher.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndCross(wormholeIndex) {
	if (!wormhole || wormhole.length === 0 || !cross) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let crossX = cross.xPos
	let crossY = cross.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, crossX, crossY)
	startSwapAnimation(cross, crossX, crossY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	cross.fadeInOpacity = 1.0
	cross.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndLightning(wormholeIndex) {
	if (!wormhole || wormhole.length === 0 || !lightning) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let lightningX = lightning.xPos
	let lightningY = lightning.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, lightningX, lightningY)
	startSwapAnimation(lightning, lightningX, lightningY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	lightning.fadeInOpacity = 1.0
	lightning.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndBush(wormholeIndex) {
	if (!wormhole || wormhole.length === 0 || !bush) return
	
	// Swap with specified wormhole
	let wh = wormhole[wormholeIndex]
	if (!wh) return
	
	let whX = wh.xPos
	let whY = wh.yPos
	let bushX = bush.xPos
	let bushY = bush.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh, whX, whY, bushX, bushY)
	startSwapAnimation(bush, bushX, bushY, whX, whY)
	
	// Ensure items are instantly visible
	wh.fadeInOpacity = 1.0
	wh.fadeInStartTime = Date.now()
	bush.fadeInOpacity = 1.0
	bush.fadeInStartTime = Date.now()
	
	selectedForConversion = null
}

function swapWormholeAndWormhole(wormholeIndex1, wormholeIndex2) {
	if (!wormhole || wormhole.length === 0) return
	if (wormholeIndex1 === wormholeIndex2) return
	
	// Swap positions between two wormholes
	let wh1 = wormhole[wormholeIndex1]
	let wh2 = wormhole[wormholeIndex2]
	if (!wh1 || !wh2) return
	
	let wh1X = wh1.xPos
	let wh1Y = wh1.yPos
	let wh2X = wh2.xPos
	let wh2Y = wh2.yPos
	
	// Swap positions with animation
	startSwapAnimation(wh1, wh1X, wh1Y, wh2X, wh2Y)
	startSwapAnimation(wh2, wh2X, wh2Y, wh1X, wh1Y)
	
	// Ensure wormholes are instantly visible
	wh1.fadeInOpacity = 1.0
	wh1.fadeInStartTime = Date.now()
	wh2.fadeInOpacity = 1.0
	wh2.fadeInStartTime = Date.now()
	
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
	ballTappedForSelection = false // Reset flag
	touchMoved = false // Reset flag
	
	// Victory drawing mode - when trophy appears, allow user to draw freely
	// But if touching near the ball or trophy, allow flinging/swapping instead
	if (trophy) {
		let ballRadius = getBallRadius()
		let ballDistance = Math.hypot(touch1.xPos - ball.xPos, touch1.yPos - ball.yPos)
		let trophyDistance = Math.hypot(touch1.xPos - trophy.xPos, touch1.yPos - trophy.yPos)
		let touchingBall = ballDistance < ballRadius + TOUCH_TOLERANCE
		let touchingTrophy = trophyDistance < trophy.radius + TOUCH_TOLERANCE
		if (!touchingBall && !touchingTrophy) {
			// Not touching ball or trophy - start drawing
			currentVictoryStroke = [{ x: touch1.xPos, y: touch1.yPos }]
			victoryTouchPos = { x: touch1.xPos, y: touch1.yPos }
			return
		}
		// Touching ball or trophy - fall through to fling/swap logic below
	}
	
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
		// Clicked on score - instantly advance to next level (without incrementing score)
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
	
	// If ball is stopped by bush effect, check ball FIRST before anything else to allow re-flinging
	if (ballStoppedByBushEffect) {
		let ballDistance = Math.hypot(touch1.xPos - ball.xPos, touch1.yPos - ball.yPos)
		if (ballDistance < ballRadius + TOUCH_TOLERANCE * 2) { // Use larger tolerance for easier detection
			// User tapped on or near ball - allow flinging (but don't select for swapping)
			ball.isBeingFlung = true
			ballStoppedByBushEffect = false
			return
		}
	}
	
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
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping star - swap positions
				swapStarAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping star - swap positions
				swapStarAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping star - swap positions
				swapLightningAndStar()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping star - swap positions
				swapBushAndStar()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping star - swap positions
				swapWormholeAndStar(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Already selected: deselect this star
				selectedForConversion = null
				return
			} else {
				// First tap: select this star
				selectedForConversion = { type: 'star', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a cross (check before obstacles/targets to prioritize)
	if (cross) {
		let crossDistance = Math.hypot(touch1.xPos - cross.xPos, touch1.yPos - cross.yPos)
		if (crossDistance < cross.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping cross - swap positions
				swapCrossAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping cross - swap positions
				swapCrossAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping cross - swap positions
				swapStarAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping cross - swap positions
				swapCrossAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping cross - swap positions
				swapLightningAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping cross - swap positions
				swapBushAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping cross - swap positions
				swapWormholeAndCross(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Already selected: deselect this cross
				selectedForConversion = null
				return
			} else {
				// First tap: select this cross
				selectedForConversion = { type: 'cross', index: 0 }
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
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping switcher - swap positions
				swapCrossAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping switcher - swap positions
				swapLightningAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping switcher - swap positions
				swapBushAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping switcher - swap positions
				swapWormholeAndSwitcher(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Already selected: deselect this switcher
				selectedForConversion = null
				return
			} else {
				// First tap: select this switcher
				selectedForConversion = { type: 'switcher', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a lightning (check before obstacles/targets to prioritize)
	if (lightning) {
		let lightningDistance = Math.hypot(touch1.xPos - lightning.xPos, touch1.yPos - lightning.yPos)
		if (lightningDistance < lightning.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping lightning - swap positions
				swapLightningAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping lightning - swap positions
				swapLightningAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping lightning - swap positions
				swapLightningAndStar()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping lightning - swap positions
				swapLightningAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping lightning - swap positions
				swapLightningAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping lightning - swap positions
				swapBushAndLightning()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping lightning - swap positions
				swapWormholeAndLightning(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Already selected: deselect this lightning
				selectedForConversion = null
				return
			} else {
				// First tap: select this lightning
				selectedForConversion = { type: 'lightning', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a bush (check before obstacles/targets to prioritize)
	if (bush) {
		let bushDistance = Math.hypot(touch1.xPos - bush.xPos, touch1.yPos - bush.yPos)
		if (bushDistance < bush.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping bush - swap positions
				swapBushAndTarget(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping bush - swap positions
				swapBushAndObstacle(selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping bush - swap positions
				swapBushAndStar()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping bush - swap positions
				swapBushAndSwitcher()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping bush - swap positions
				swapBushAndCross()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping bush - swap positions
				swapBushAndLightning()
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Already selected: deselect this bush
				selectedForConversion = null
				return
			} else {
				// First tap: select this bush
				selectedForConversion = { type: 'bush', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on a wormhole (check before obstacles/targets to prioritize)
	if (wormhole && wormhole.length > 0) {
		// Check both wormholes
		for (let i = 0; i < wormhole.length; i++) {
			let wh = wormhole[i]
			if (!wh) continue
			
			let whDistance = Math.hypot(touch1.xPos - wh.xPos, touch1.yPos - wh.yPos)
			if (whDistance < wh.radius + TOUCH_TOLERANCE) {
				if (selectedForConversion && selectedForConversion.type === 'target') {
					// Second tap: we have a target selected, now tapping wormhole - swap positions with this wormhole
					swapWormholeAndTarget(selectedForConversion.index, i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'obstacle') {
					// Second tap: we have an obstacle selected, now tapping wormhole - swap positions
					swapWormholeAndObstacle(selectedForConversion.index, i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'star') {
					// Second tap: we have a star selected, now tapping wormhole - swap positions
					swapWormholeAndStar(i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
					// Second tap: we have a switcher selected, now tapping wormhole - swap positions
					swapWormholeAndSwitcher(i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'cross') {
					// Second tap: we have a cross selected, now tapping wormhole - swap positions
					swapWormholeAndCross(i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
					// Second tap: we have a lightning selected, now tapping wormhole - swap positions
					swapWormholeAndLightning(i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'bush') {
					// Second tap: we have a bush selected, now tapping wormhole - swap positions
					swapWormholeAndBush(i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
					// Second tap: we have another wormhole selected, now tapping this wormhole - swap positions
					swapWormholeAndWormhole(selectedForConversion.index, i)
					return
				} else if (selectedForConversion && selectedForConversion.type === 'wormhole' && selectedForConversion.index === i) {
					// Already selected: deselect this wormhole
					selectedForConversion = null
					return
				} else {
					// First tap: select this specific wormhole
					selectedForConversion = { type: 'wormhole', index: i }
					return
				}
			}
		}
	}
	
	// Check if tapping on an obstacle (check before ball to prioritize smaller targets)
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		let distance = Math.hypot(touch1.xPos - obstacle.xPos, touch1.yPos - obstacle.yPos)
		if (distance < targetRadius + TOUCH_TOLERANCE) {
			// If ball is stopped by bush effect and overlaps this obstacle, skip obstacle selection
			if (ballStoppedByBushEffect && Math.abs(ball.xPos - obstacle.xPos) < 1 && Math.abs(ball.yPos - obstacle.yPos) < 1) {
				// Ball is overlapping obstacle - skip this obstacle to allow ball to be selected
				continue
			}
			if (selectedForConversion && selectedForConversion.type === 'target') {
				// Second tap: we have a target selected, now tapping obstacle - convert both
				convertTargetAndObstacle(selectedForConversion.index, i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'star') {
				// Second tap: we have a star selected, now tapping obstacle - swap positions
				swapStarAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping obstacle - swap positions
				swapCrossAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping obstacle - swap positions
				swapSwitcherAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping obstacle - swap positions
				swapLightningAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping obstacle - swap positions
				swapBushAndObstacle(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping obstacle - swap positions
				swapWormholeAndObstacle(i, selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'obstacle' && selectedForConversion.index === i) {
				// Already selected: deselect this obstacle
				selectedForConversion = null
				return
			} else {
				// First tap: select this obstacle
				selectedForConversion = { type: 'obstacle', index: i }
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
			} else if (selectedForConversion && selectedForConversion.type === 'cross') {
				// Second tap: we have a cross selected, now tapping target - swap positions
				swapCrossAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'switcher') {
				// Second tap: we have a switcher selected, now tapping target - swap positions
				swapSwitcherAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'lightning') {
				// Second tap: we have a lightning selected, now tapping target - swap positions
				swapLightningAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'bush') {
				// Second tap: we have a bush selected, now tapping target - swap positions
				swapBushAndTarget(i)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'wormhole') {
				// Second tap: we have a wormhole selected, now tapping target - swap positions
				swapWormholeAndTarget(i, selectedForConversion.index)
				return
			} else if (selectedForConversion && selectedForConversion.type === 'target' && selectedForConversion.index === i) {
				// Already selected: deselect this target
				selectedForConversion = null
				return
			} else {
				// First tap: select this target
				selectedForConversion = { type: 'target', index: i }
				return
			}
		}
	}
	
	// Check if tapping on the trophy (big door)
	if (trophy && !trophy.hit) {
		let trophyDistance = Math.hypot(touch1.xPos - trophy.xPos, touch1.yPos - trophy.yPos)
		if (trophyDistance < trophy.radius + TOUCH_TOLERANCE) {
			if (selectedForConversion && selectedForConversion.type === 'trophy') {
				// Already selected: deselect this trophy
				selectedForConversion = null
				return
			} else {
				// First tap: select this trophy
				selectedForConversion = { type: 'trophy', index: 0 }
				return
			}
		}
	}
	
	// Check if tapping on the ball (check after targets/obstacles to avoid blocking them)
	let ballDistance = Math.hypot(touch1.xPos - ball.xPos, touch1.yPos - ball.yPos)
	if (ballDistance < ballRadius + TOUCH_TOLERANCE) {
		// Check if we have something selected to swap with (allow swaps even when ball is moving)
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
			} else if (selectedForConversion.type === 'cross') {
				swapBallAndCross()
				return
			} else if (selectedForConversion.type === 'lightning') {
				swapBallAndLightning()
				return
			} else if (selectedForConversion.type === 'bush') {
				swapBallAndBush()
				return
			} else if (selectedForConversion.type === 'wormhole') {
				swapBallAndWormhole(selectedForConversion.index)
				return
			} else if (selectedForConversion.type === 'trophy') {
				swapBallAndTrophy()
				return
			}
		}
		
		// If the ball is still moving fast enough, ignore this tap so you can't "double-fling".
		// (But swaps above are still allowed even when ball is moving)
		let currentSpeed = Math.hypot(ball.xVel, ball.yVel)
		if (currentSpeed > BALL_STOP_SPEED) {
			return
		}
		
		// If nothing selected, prepare for flinging (don't select for swapping yet)
		// Selection will happen in touchend only if user didn't drag (it was a tap)
		ballTappedForSelection = true
		ball.isBeingFlung = true
		// Reset the flag when user starts flinging again
		ballStoppedByBushEffect = false
		// Don't set shotActive here - only set it when user actually drags
		return
	}
	
	// If tapping empty space, clear selection
	selectedForConversion = null
}

function handleTouchmove(e) {
	e.preventDefault()
	let canvasRect = canvas.getBoundingClientRect()
	let touch2 = { 
		xPos: e.touches[0].clientX, 
		yPos: e.touches[0].clientY 
	}
	
	// Victory drawing mode - add points to current stroke
	if (trophy && currentVictoryStroke) {
		let canvasX = e.touches[0].clientX - canvasRect.left
		let canvasY = e.touches[0].clientY - canvasRect.top
		currentVictoryStroke.push({ x: canvasX, y: canvasY })
		victoryTouchPos = { x: canvasX, y: canvasY }
		return
	}
	
	// If user moved their finger, it's a fling, not a tap
	if (ballTappedForSelection) {
		let currentX = e.touches[0].clientX - canvasRect.left
		let currentY = e.touches[0].clientY - canvasRect.top
		let moveDistance = Math.hypot(currentX - touch1.xPos, currentY - touch1.yPos)
		if (moveDistance > 5) { // Small threshold to distinguish tap from drag
			touchMoved = true
		}
	}
	if (ball.isBeingFlung) {
		// Only start a shot when user actually drags (not just taps)
		if (!shotActive) {
			shotActive = true
			// Reset cross hit flag when starting a new try
			crossHitThisTry = false
			// Reset star hit flag when starting a new try
			starHitThisTry = false
			// Tutorial disabled - no progression
			tries++
		}
		ball.xVel = (touch2.xPos - touch1.xPos) / FLING_DIVISOR
		ball.yVel = (touch2.yPos - touch1.yPos) / FLING_DIVISOR
	}
}

function handleTouchend() {
	// Victory drawing mode - finish current stroke
	if (trophy && currentVictoryStroke && currentVictoryStroke.length > 0) {
		victoryDrawingStrokes.push(currentVictoryStroke)
		currentVictoryStroke = null
		victoryTouchPos = null
		return
	}
	
	// Ball can only be swapped when tapped second (after selecting another sprite)
	// So we don't select the ball for swapping here
	ball.isBeingFlung = false
	isConvertingObstacle = false
	ballTappedForSelection = false // Reset flag
	touchMoved = false // Reset flag
}

function getScoreBounds() {
	// Get score text bounds to avoid overlapping
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
	return {
		left: scoreTextX - scoreWidth,
		right: scoreTextX,
		top: scoreTextY - ascent,
		bottom: scoreTextY + descent
	}
}

function overlapsWithScore(xPos, yPos, radius) {
	let scoreBounds = getScoreBounds()
	// Add padding for radius
	let spriteLeft = xPos - radius
	let spriteRight = xPos + radius
	let spriteTop = yPos - radius
	let spriteBottom = yPos + radius
	
	// Check if sprite overlaps with score area
	return !(spriteRight < scoreBounds.left || spriteLeft > scoreBounds.right ||
	         spriteBottom < scoreBounds.top || spriteTop > scoreBounds.bottom)
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
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, radius)) {
			validPosition = false
		}
		
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
			
			// Check if overlaps with score
			if (overlapsWithScore(xPos, yPos, radius)) {
				validPosition = false
			}
			
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
			
			// Check if overlaps with score
			if (overlapsWithScore(xPos, yPos, obstacleRadius)) {
				validPosition = false
			}
			
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
	// Make the door smaller than before
	let trophyRadius = getTargetRadius() * 2.5
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
			// Choose horizontal position: random across the width (with padding for trophy radius)
			xPos = trophyRadius + (canvas.width - 2 * trophyRadius) * Math.random()

			// Choose vertical position:
			// - Level 1: random within the top half.
			// - Level 2+: full vertical range.
			if (level === 1) {
				let maxTopHalfHeight = canvas.height / 2 - trophyRadius
				if (maxTopHalfHeight < trophyRadius) {
					maxTopHalfHeight = trophyRadius
				}
				yPos = trophyRadius + (maxTopHalfHeight - trophyRadius) * Math.random()
			} else {
				yPos = trophyRadius + (canvas.height - 2 * trophyRadius) * Math.random()
			}
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
		// On levels 1 and 2, keep the fallback in the top half as well
		if (level === 1 || level === 2) {
			yPos = canvas.height / 4
		} else {
			yPos = canvas.height / 2
		}
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

	// On level 1, while step 2 tutorial text is showing, also show a trophy hint line.
	if (level === 1 && tutorialStep === 2) {
		let hint = document.getElementById("trophyHintOverlay")
		if (!hint) {
			hint = document.createElement("div")
			hint.id = "trophyHintOverlay"
			hint.style.position = "absolute"
			hint.style.color = "white"
			hint.style.fontFamily = "Arial"
			hint.style.fontSize = "24px"
			hint.style.pointerEvents = "none"
			hint.style.textAlign = "center"
			hint.style.textShadow = "-2px -2px 0 black, 2px -2px 0 black, -2px 2px 0 black, 2px 2px 0 black, -2px 0 0 black, 2px 0 0 black, 0 -2px 0 black, 0 2px 0 black"
			let container = document.getElementById("canvasContainer") || document.body
			container.appendChild(hint)
		}
		hint.textContent = "(then collect the trophy)"
		// Center horizontally at 60% canvas height
		let x = canvas.width / 2
		let y = canvas.height * 0.6
		hint.style.left = x + "px"
		hint.style.top = y + "px"
		hint.style.transform = "translate(-50%, -50%)"
		hint.style.visibility = "visible"
		hint.style.opacity = "1"
	}
}

function placeTargets() {
	// Level 1: 1 target, level 2: 2 targets, level 3: 3 targets, 
	// level 4: 4 targets, level 5+: 5 targets
	let targetCount = Math.min(level, 5)
	placeTargetsWithCount(targetCount)
}

function placeObstacles() {
	// Level 1: 1 obstacle, level 2: 2 obstacles, level 3: 3 obstacles,
	// level 4: 4 obstacles, level 5+: 5 obstacles
	let obstacleCount = Math.min(level, 5)
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
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, starRadius)) {
			validPosition = false
		}
		
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
		
		// Check distance from cross if it exists
		if (validPosition && cross) {
			let dx5 = xPos - cross.xPos
			let dy5 = yPos - cross.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = starRadius + cross.radius + minSeparation
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
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, switcherRadius)) {
			validPosition = false
		}
		
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
		
		// Check distance from cross if it exists
		if (validPosition && cross) {
			let dx5 = xPos - cross.xPos
			let dy5 = yPos - cross.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = switcherRadius + cross.radius + minSeparation
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

function placeCross() {
	let crossRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep cross away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure cross is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = crossRadius + (canvas.width - 2 * crossRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = crossRadius + topExclusionZone
		let maxY = canvas.height - Math.max(crossRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, crossRadius)) {
			validPosition = false
		}
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = crossRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = crossRadius + targetRadius + minSeparation
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
				let minDistance3 = crossRadius + obstacles[j].radius + minSeparation
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
			let minDistance4 = crossRadius + star.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from switcher if it exists
		if (validPosition && switcher) {
			let dx5 = xPos - switcher.xPos
			let dy5 = yPos - switcher.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = crossRadius + switcher.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = crossRadius + (canvas.width - 2 * crossRadius) * Math.random()
		let minY = crossRadius + topExclusionZone
		let maxY = canvas.height - Math.max(crossRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	cross = {
		xPos: xPos,
		yPos: yPos,
		radius: crossRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function placeLightning() {
	let lightningRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep lightning away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure lightning is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = lightningRadius + (canvas.width - 2 * lightningRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = lightningRadius + topExclusionZone
		let maxY = canvas.height - Math.max(lightningRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, lightningRadius)) {
			validPosition = false
		}
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = lightningRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = lightningRadius + targetRadius + minSeparation
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
				let minDistance3 = lightningRadius + obstacles[j].radius + minSeparation
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
			let minDistance4 = lightningRadius + star.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from switcher if it exists
		if (validPosition && switcher) {
			let dx5 = xPos - switcher.xPos
			let dy5 = yPos - switcher.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = lightningRadius + switcher.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		// Check distance from cross if it exists
		if (validPosition && cross) {
			let dx6 = xPos - cross.xPos
			let dy6 = yPos - cross.yPos
			let distance6 = Math.hypot(dx6, dy6)
			let minDistance6 = lightningRadius + cross.radius + minSeparation
			if (distance6 < minDistance6) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = lightningRadius + (canvas.width - 2 * lightningRadius) * Math.random()
		let minY = lightningRadius + topExclusionZone
		let maxY = canvas.height - Math.max(lightningRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	lightning = {
		xPos: xPos,
		yPos: yPos,
		radius: lightningRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function placeBush() {
	let bushRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	// No exclusion zone - score and buttons are disabled
	let topExclusionZone = 0
	// Keep bush away from the very bottom: never within 4 grey-ball
	// diameters of the bottom edge.
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let attempts = 0
	let xPos, yPos
	let validPosition = false
	
	while (!validPosition && attempts < maxAttempts) {
		// Ensure bush is fully within canvas bounds, and not too close
		// to the bottom edge.
		xPos = bushRadius + (canvas.width - 2 * bushRadius) * Math.random()
		// Exclude top area unless high level, and also exclude a band
		// near the bottom based on grey ball size.
		let minY = bushRadius + topExclusionZone
		let maxY = canvas.height - Math.max(bushRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
		validPosition = true
		
		// Check if overlaps with score
		if (overlapsWithScore(xPos, yPos, bushRadius)) {
			validPosition = false
		}
		
		// Check distance from ball
		let dx = xPos - ball.xPos
		let dy = yPos - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = bushRadius + ballRadius + minSeparation
		if (distance < minDistance) {
			validPosition = false
		}
		
		// Check distance from targets
		if (validPosition) {
			for (let j = 0; j < targets.length; j++) {
				let dx2 = xPos - targets[j].xPos
				let dy2 = yPos - targets[j].yPos
				let distance2 = Math.hypot(dx2, dy2)
				let minDistance2 = bushRadius + targetRadius + minSeparation
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
				let minDistance3 = bushRadius + obstacles[j].radius + minSeparation
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
			let minDistance4 = bushRadius + star.radius + minSeparation
			if (distance4 < minDistance4) {
				validPosition = false
			}
		}
		
		// Check distance from switcher if it exists
		if (validPosition && switcher) {
			let dx5 = xPos - switcher.xPos
			let dy5 = yPos - switcher.yPos
			let distance5 = Math.hypot(dx5, dy5)
			let minDistance5 = bushRadius + switcher.radius + minSeparation
			if (distance5 < minDistance5) {
				validPosition = false
			}
		}
		
		// Check distance from cross if it exists
		if (validPosition && cross) {
			let dx6 = xPos - cross.xPos
			let dy6 = yPos - cross.yPos
			let distance6 = Math.hypot(dx6, dy6)
			let minDistance6 = bushRadius + cross.radius + minSeparation
			if (distance6 < minDistance6) {
				validPosition = false
			}
		}
		
		// Check distance from lightning if it exists
		if (validPosition && lightning) {
			let dx7 = xPos - lightning.xPos
			let dy7 = yPos - lightning.yPos
			let distance7 = Math.hypot(dx7, dy7)
			let minDistance7 = bushRadius + lightning.radius + minSeparation
			if (distance7 < minDistance7) {
				validPosition = false
			}
		}
		
		attempts++
	}
	
	// Fallback: ensure position is valid even if loop exhausted attempts
	if (!validPosition) {
		xPos = bushRadius + (canvas.width - 2 * bushRadius) * Math.random()
		let minY = bushRadius + topExclusionZone
		let maxY = canvas.height - Math.max(bushRadius, bottomExclusion)
		yPos = minY + (maxY - minY) * Math.random()
	}
	
	bush = {
		xPos: xPos,
		yPos: yPos,
		radius: bushRadius,
		fadeInOpacity: 0, // Start invisible for fade-in
		fadeInStartTime: Date.now() + FADE_IN_DELAY // Delay before fade-in starts
	}
}

function placeWormholes() {
	let wormholeRadius = getBallRadius() // Same size as ball
	let ballRadius = getBallRadius()
	let targetRadius = getTargetRadius()
	let minSeparation = 5
	let maxAttempts = 100
	let topExclusionZone = 0
	let bottomExclusion = 8 * ballRadius // 4 * (2 * ballRadius)
	let minWormholeDistance = Math.min(canvas.width, canvas.height) * 0.3 // Minimum distance between wormholes
	
	// Helper function to check if a position is valid for a wormhole
	function isValidPosition(x, y, radius, excludeWormholes = []) {
		// Check if overlaps with score
		if (overlapsWithScore(x, y, radius)) {
			return false
		}
		
		// Check distance from ball
		let dx = x - ball.xPos
		let dy = y - ball.yPos
		let distance = Math.hypot(dx, dy)
		let minDistance = radius + ballRadius + minSeparation
		if (distance < minDistance) {
			return false
		}
		
		// Check distance from targets
		for (let j = 0; j < targets.length; j++) {
			let dx2 = x - targets[j].xPos
			let dy2 = y - targets[j].yPos
			let distance2 = Math.hypot(dx2, dy2)
			let minDistance2 = radius + targetRadius + minSeparation
			if (distance2 < minDistance2) {
				return false
			}
		}
		
		// Check distance from obstacles
		for (let j = 0; j < obstacles.length; j++) {
			let dx3 = x - obstacles[j].xPos
			let dy3 = y - obstacles[j].yPos
			let distance3 = Math.hypot(dx3, dy3)
			let minDistance3 = radius + obstacles[j].radius + minSeparation
			if (distance3 < minDistance3) {
				return false
			}
		}
		
		// Check distance from other special items
		let specialItems = [{item: star}, {item: switcher}, {item: cross}, {item: lightning}, {item: bush}]
		for (let special of specialItems) {
			if (special.item) {
				let dx4 = x - special.item.xPos
				let dy4 = y - special.item.yPos
				let distance4 = Math.hypot(dx4, dy4)
				let minDistance4 = radius + special.item.radius + minSeparation
				if (distance4 < minDistance4) {
					return false
				}
			}
		}
		
		// Check distance from other wormholes
		for (let wh of excludeWormholes) {
			let dx5 = x - wh.xPos
			let dy5 = y - wh.yPos
			let distance5 = Math.hypot(dx5, dy5)
			if (distance5 < minWormholeDistance) {
				return false
			}
		}
		
		return true
	}
	
	// Place first wormhole
	let attempts = 0
	let xPos1, yPos1
	let validPosition1 = false
	
	while (!validPosition1 && attempts < maxAttempts) {
		xPos1 = wormholeRadius + (canvas.width - 2 * wormholeRadius) * Math.random()
		let minY = wormholeRadius + topExclusionZone
		let maxY = canvas.height - Math.max(wormholeRadius, bottomExclusion)
		yPos1 = minY + (maxY - minY) * Math.random()
		
		if (isValidPosition(xPos1, yPos1, wormholeRadius)) {
			validPosition1 = true
		}
		attempts++
	}
	
	// Fallback for first wormhole
	if (!validPosition1) {
		xPos1 = wormholeRadius + (canvas.width - 2 * wormholeRadius) * Math.random()
		let minY = wormholeRadius + topExclusionZone
		let maxY = canvas.height - Math.max(wormholeRadius, bottomExclusion)
		yPos1 = minY + (maxY - minY) * Math.random()
	}
	
	let wormhole1 = {
		xPos: xPos1,
		yPos: yPos1,
		radius: wormholeRadius,
		fadeInOpacity: 0,
		fadeInStartTime: Date.now() + FADE_IN_DELAY
	}
	
	// Place second wormhole (must be at least minWormholeDistance away from first)
	attempts = 0
	let xPos2, yPos2
	let validPosition2 = false
	
	while (!validPosition2 && attempts < maxAttempts) {
		xPos2 = wormholeRadius + (canvas.width - 2 * wormholeRadius) * Math.random()
		let minY = wormholeRadius + topExclusionZone
		let maxY = canvas.height - Math.max(wormholeRadius, bottomExclusion)
		yPos2 = minY + (maxY - minY) * Math.random()
		
		if (isValidPosition(xPos2, yPos2, wormholeRadius, [wormhole1])) {
			validPosition2 = true
		}
		attempts++
	}
	
	// Fallback for second wormhole
	if (!validPosition2) {
		xPos2 = wormholeRadius + (canvas.width - 2 * wormholeRadius) * Math.random()
		let minY = wormholeRadius + topExclusionZone
		let maxY = canvas.height - Math.max(wormholeRadius, bottomExclusion)
		yPos2 = minY + (maxY - minY) * Math.random()
	}
	
	let wormhole2 = {
		xPos: xPos2,
		yPos: yPos2,
		radius: wormholeRadius,
		fadeInOpacity: 0,
		fadeInStartTime: Date.now() + FADE_IN_DELAY
	}
	
	wormhole = [wormhole1, wormhole2]
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
			
			// Start level 2 hint fade-in when auto-reset completes for try 4 (tries == 3)
			if (level === 2 && tries === 3 && level2HintFadeInStartTime === null) {
				level2HintFadeInStartTime = Date.now()
			}
		}
		return
	}

	// Check if ball is in transit through a wormhole
	if (wormholeTeleportPending) {
		// Keep ball hidden during transit
		ball.fadeOpacity = 0
		
		let elapsed = Date.now() - wormholeTeleportPending.startTime
		if (elapsed >= 500) {
			// Half a second has passed - teleport the ball
			ball.xPos = wormholeTeleportPending.destX
			ball.yPos = wormholeTeleportPending.destY
			ball.xVel = wormholeTeleportPending.xVel
			ball.yVel = wormholeTeleportPending.yVel
			ball.fadeOpacity = 1.0 // Make ball visible again
			
			// Ensure ball is still marked as being flung
			if (wormholeTeleportPending.xVel !== 0 || wormholeTeleportPending.yVel !== 0) {
				ball.isBeingFlung = true
			}
			
			// Clear pending teleport
			wormholeTeleportPending = null
		} else {
			// Still in transit - don't move the ball, keep it hidden
			return
		}
	}

	// Normal motion
	ball.xPos += ball.xVel
	ball.yPos += ball.yVel
	
	// Apply friction
	ball.xVel *= FRICTION 
	ball.yVel *= FRICTION

	// If a shot is in progress, the ball has effectively stopped (after the fling),
	// and we still have targets remaining, start a quick animated reset of this
	// level: ball glides back to its starting spot while previously-cleared
	// targets fade back in, both finishing at the same time.
	if (shotActive && !pendingNextLevel && !isGeneratingLevel && targetsRemaining.length > 0) {
		let speed = Math.hypot(ball.xVel, ball.yVel)
		
		// If ball was being flung (from wormhole teleport or normal fling) and has slowed down,
		// mark it as no longer being flung so auto-reset can trigger
		// Use a conservative approach: only reset after ball has been slow for a brief moment
		// to avoid interfering with active flinging or rapid velocity changes
		if (ball.isBeingFlung) {
			if (speed < BALL_STOP_SPEED) {
				// Ball is slow - start tracking time
				if (ballSlowBelowStopSpeedTime === null) {
					ballSlowBelowStopSpeedTime = Date.now()
				} else {
					// Ball has been slow for confirmation time - safe to reset
					let timeSlow = Date.now() - ballSlowBelowStopSpeedTime
					if (timeSlow >= BALL_SLOW_CONFIRMATION_TIME) {
						ball.isBeingFlung = false
						ballSlowBelowStopSpeedTime = null
					}
				}
			} else {
				// Ball sped up again - reset tracking
				ballSlowBelowStopSpeedTime = null
			}
		} else {
			// Ball is not being flung - clear tracking
			ballSlowBelowStopSpeedTime = null
		}
		
		// Check for auto-reset: ball must not be actively being flung AND speed must be below threshold
		if (!ball.isBeingFlung && speed < BALL_STOP_SPEED) {
			// If the ball is still moving fast enough and our simple straight-line-
			// with-friction prediction says it will clear all remaining targets,
			// don't end the run yet.
			if (speed >= BALL_MIN_CONTINUE_SPEED && willClearAllTargetsOnCurrentPath()) {
				return
			}
			
			// Don't auto-reset if ball was stopped by bush effect (user can fling again)
			if (ballStoppedByBushEffect) {
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

			// Restore the score to what it was at the start of the level
			completionScore = savedCompletionScore

			// CRITICAL: Restore everything to exactly match the initial level state
			// Restore targets array first
			if (savedTargets && savedTargets.length > 0) {
				targets = JSON.parse(JSON.stringify(savedTargets))
			}
			
			// Restore targetsRemaining from savedTargets - make them fully visible immediately (no fade-in)
			if (savedTargets && savedTargets.length > 0) {
				let newTargetsRemaining = []
				for (let i = 0; i < savedTargets.length; i++) {
					newTargetsRemaining.push({
						xPos: savedTargets[i].xPos,
						yPos: savedTargets[i].yPos,
						fadeInOpacity: 1.0,
						fadeInStartTime: Date.now() // Already started, so fade-in won't trigger
					})
				}
				targetsRemaining = newTargetsRemaining
			}
			
			// Restore obstacles from savedObstacles - make them fully visible immediately (no fade-in)
			if (savedObstacles && savedObstacles.length > 0) {
				obstacles = JSON.parse(JSON.stringify(savedObstacles))
				// Make all restored obstacles fully visible immediately
				for (let i = 0; i < obstacles.length; i++) {
					obstacles[i].fadeInOpacity = 1.0
					obstacles[i].fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
				}
			}
			
			// Restore sprites (star, switcher, cross) exactly as they were at level start - make them fully visible immediately (no fade-in)
			if (savedStar) {
				star = JSON.parse(JSON.stringify(savedStar))
				star.fadeInOpacity = 1.0
				star.fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
			} else {
				star = null
			}
			if (savedSwitcher) {
				switcher = JSON.parse(JSON.stringify(savedSwitcher))
				switcher.fadeInOpacity = 1.0
				switcher.fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
			} else {
				switcher = null
			}
			if (savedCross) {
				cross = JSON.parse(JSON.stringify(savedCross))
				cross.fadeInOpacity = 1.0
				cross.fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
				// Reset cross hit flag so it can be hit again
				crossHitThisTry = false
			} else {
				cross = null
			}
			if (savedLightning) {
				lightning = JSON.parse(JSON.stringify(savedLightning))
				lightning.fadeInOpacity = 1.0
				lightning.fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
			} else {
				lightning = null
			}
			if (savedBush) {
				bush = JSON.parse(JSON.stringify(savedBush))
				bush.fadeInOpacity = 1.0
				bush.fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
			} else {
				bush = null
			}
			if (savedWormhole) {
				wormhole = savedWormhole ? JSON.parse(JSON.stringify(savedWormhole)) : null
				if (wormhole && wormhole.length > 0) {
					for (let i = 0; i < wormhole.length; i++) {
						if (wormhole[i]) {
							wormhole[i].fadeInOpacity = 1.0
							wormhole[i].fadeInStartTime = Date.now() // Already started, so fade-in won't trigger
						}
					}
				}
			} else {
				wormhole = null
			}
			// Reset lightning, bush, and cannon effects
			lightningEffectActive = false
			bushEffectActive = false
			magnetEffectActive = false
			ballStoppedByBushEffect = false
			
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
	// OR in transit through a wormhole, ignore collisions so nothing interferes with these animations.
	if (ball && (ball.isSpawningToStart || autoResetActive || wormholeTeleportPending)) {
		return
	}
	handleCollisionWithTarget()
	handleCollisionWithObstacle()
	handleCollisionWithEdge()
	handleCollisionWithStar()
	handleCollisionWithSwitcher()
	handleCollisionWithCross()
	handleCollisionWithLightning()
	handleCollisionWithBush()
	handleCollisionWithWormhole()
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
			
			// Increment completion score when a target is collected
			completionScore++
			
			// Fade away obstacles when last target is collected
			// Check this BEFORE the bush effect early return so level completion still works
			if (wasLastTarget) {
				// This shot successfully cleared all targets
				shotActive = false
				
				// Start fading out all hints when last target is hit
				let fadeOutTime = Date.now()
				if (level === 1 && level1HintFadeOutStartTime === null) {
					level1HintFadeOutStartTime = fadeOutTime
				}
				if (level === 2 && level2HintFadeOutStartTime === null) {
					level2HintFadeOutStartTime = fadeOutTime
				}
				if (level === 3 && level3HintFadeOutStartTime === null) {
					level3HintFadeOutStartTime = fadeOutTime
				}
				if (level === 10 && level10HintFadeOutStartTime === null) {
					level10HintFadeOutStartTime = fadeOutTime
				}
				
				// Remember where the last target was collected so we can place the trophy there
				lastTargetX = targetX
				lastTargetY = targetY
				
				// Start fading obstacles and special items after delay
				setTimeout(() => {
					for (let j = 0; j < obstacles.length; j++) {
						let obstacle = obstacles[j]
						obstacle.fadeOpacity = 1.0
						obstacle.fading = true
					}
					
					// Also remove any special items so they disappear with the obstacles
					star = null
					switcher = null
					cross = null
					lightning = null
					bush = null
					wormhole = null
				}, OBSTACLE_FADE_DELAY)
				
				// Fade tutorial text after delay (but skip step 2 and all of level 2 tutorial - they fade after trophy)
				tutorialExplosionTimeout = setTimeout(() => {
					let tutorialOverlay = document.getElementById("tutorialOverlay")
					if (tutorialOverlay && tutorialOverlay.style.visibility === "visible") {
						// Don't fade step 2 on level 1 or any tutorial text on level 2 here –
						// they should remain visible until the next level actually appears.
						if (!((level === 1 && tutorialStep === 2) || level === 2)) {
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
			
			// If bush effect is active, stop the ball (user can fling again)
			// But only if it wasn't the last target (level completion already handled above)
			if (bushEffectActive && !wasLastTarget) {
				ballStoppedByBushEffect = true
				ball.xVel = 0
				ball.yVel = 0
				ball.isBeingFlung = false
				// Position ball perfectly overlapping with target center
				ball.xPos = targetX
				ball.yPos = targetY
				// Don't auto-reset - let user fling again
				return
			}
		}
	}
}

function handleCollisionWithObstacle() {
	let ballRadius = getBallRadius()
	let pushAwayBuffer = 1 // Small buffer to prevent sticking
	let currentTime = Date.now()
	
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		let dx = ball.xPos - obstacle.xPos
		let dy = ball.yPos - obstacle.yPos
		let distance = Math.hypot(dx, dy)
		let collisionDistance = ballRadius + obstacle.radius
		
		if (distance < collisionDistance && distance > 0) {
			// Track this collision for stuck detection
			obstacleCollisionTimes.push(currentTime)
			
			// Remove collisions outside the time window
			obstacleCollisionTimes = obstacleCollisionTimes.filter(time => currentTime - time < OBSTACLE_COLLISION_WINDOW)
			
			// If too many collisions in the time window, trigger auto-reset
			if (shotActive && obstacleCollisionTimes.length >= MAX_OBSTACLE_COLLISIONS && !autoResetActive && !pendingNextLevel && !isGeneratingLevel) {
				shotActive = false
				autoResetActive = true
				autoResetStartTime = Date.now()
				autoResetBallFromX = ball.xPos
				autoResetBallFromY = ball.yPos
				if (savedBall) {
					autoResetBallToX = savedBall.xPos
					autoResetBallToY = savedBall.yPos
				} else {
					autoResetBallToX = ball.xPos
					autoResetBallToY = ball.yPos
				}
				ball.xVel = 0
				ball.yVel = 0
				ball.isBeingFlung = false
				
				// Restore the score to what it was at the start of the level
				totalScore = savedCompletionScore
				pointsThisLevel = 0
				
				// CRITICAL: Restore everything to exactly match the initial level state
				// Restore targets array first
				if (savedTargets && savedTargets.length > 0) {
					targets = JSON.parse(JSON.stringify(savedTargets))
				}
				
				// Restore targetsRemaining from savedTargets
				if (savedTargets && savedTargets.length > 0) {
					let newTargetsRemaining = []
					for (let i = 0; i < savedTargets.length; i++) {
						newTargetsRemaining.push({
							xPos: savedTargets[i].xPos,
							yPos: savedTargets[i].yPos,
							fadeInOpacity: 1.0,
							fadeInStartTime: Date.now()
						})
					}
					targetsRemaining = newTargetsRemaining
				}
				completionScore = savedCompletionScore
				
				// Restore obstacles from savedObstacles - clear any obstacles added by cross
				if (savedObstacles && savedObstacles.length > 0) {
					obstacles = JSON.parse(JSON.stringify(savedObstacles))
					// Make all restored obstacles fully visible immediately
					for (let i = 0; i < obstacles.length; i++) {
						obstacles[i].fadeInOpacity = 1.0
						obstacles[i].fadeInStartTime = Date.now()
					}
				}
				
				// Reset obstacle collision tracking
				obstacleCollisionTimes = []
				return // Exit early since we're resetting
			}
			
			// If lightning effect is active, remove the obstacle
			if (lightningEffectActive) {
				obstacles.splice(i, 1)
				continue
			}
			
			// If bush effect is active, bounce normally (don't stop)
			// Note: bush effect only stops ball when hitting targets, not obstacles
			
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
	
	// Detect a new hit only when we enter the collision area (not every frame we overlap)
	let isCollidingNow = distance < collisionDistance && distance > 0
	let wasCollidingBefore = starHitThisTry
	
	if (isCollidingNow && !wasCollidingBefore) {
		// Enforce global special-item cooldown
		let now = Date.now()
		if (now - starLastHitTime < SPECIAL_ITEM_COOLDOWN) {
			starHitThisTry = isCollidingNow
			return
		}
		starLastHitTime = now

		// Save star position (use fixed point even if star is moved later)
		let starX = star.xPos
		let starY = star.yPos
		
		// Each hit: halve obstacle count (rounding up) and remove that many, closest first
		if (obstacles.length > 0) {
			let removeCount = Math.ceil(obstacles.length / 2)
			
			// Calculate distances from star to all obstacles
			let obstaclesWithDistances = obstacles.map((obstacle, index) => {
				let dx = starX - obstacle.xPos
				let dy = starY - obstacle.yPos
				let dist = Math.hypot(dx, dy)
				return { index, distance: dist }
			})
			
			// Sort by distance (closest first)
			obstaclesWithDistances.sort((a, b) => a.distance - b.distance)
			
			// Remove the N closest obstacles
			let indicesToRemove = obstaclesWithDistances.slice(0, removeCount).map(item => item.index)
			indicesToRemove.sort((a, b) => b - a) // remove from end to start to avoid index shifting
			for (let idx of indicesToRemove) {
				obstacles.splice(idx, 1)
			}
		}
		
		// Keep the star on the board after hit
		// star = null
		// Don't update savedObstacles - auto-reset should restore to original level state
	}
	
	// Remember collision state for next frame (true while overlapping, false otherwise)
	starHitThisTry = isCollidingNow
}

function handleCollisionWithSwitcher() {
	if (!switcher) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - switcher.xPos
	let dy = ball.yPos - switcher.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + switcher.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Enforce global special-item cooldown
		let now = Date.now()
		if (now - switcherLastHitTime < SPECIAL_ITEM_COOLDOWN) {
			return
		}
		switcherLastHitTime = now

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
		
		// Keep the switcher on the board after hit
		// switcher = null
	}
}

function handleCollisionWithCross() {
	if (!cross) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - cross.xPos
	let dy = ball.yPos - cross.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + cross.radius
	
	// Detect a new hit only when we enter the collision area (not every frame we overlap)
	let isCollidingNow = distance < collisionDistance && distance > 0
	let wasCollidingBefore = crossHitThisTry
	
	if (isCollidingNow && !wasCollidingBefore) {
		// Enforce global special-item cooldown
		let now = Date.now()
		if (now - crossLastHitTime < SPECIAL_ITEM_COOLDOWN) {
			crossHitThisTry = isCollidingNow
			return
		}
		crossLastHitTime = now

		// Ball hit the cross - double the number of obstacles
		// Remember that we just hit this frame (used as previous-frame collision flag)
		crossHitThisTry = true
		
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
				
				// Check distance from cross
				if (validPosition && cross) {
					let dx4 = xPos - cross.xPos
					let dy4 = yPos - cross.yPos
					let dist4 = Math.hypot(dx4, dy4)
					let minDist4 = obstacleRadius + cross.radius + minSeparation
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
		
		// Keep the cross on the board after hit
		// cross = null
	}

	// Remember collision state for next frame (true while overlapping, false otherwise)
	crossHitThisTry = isCollidingNow
}


function handleCollisionWithLightning() {
	if (!lightning) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - lightning.xPos
	let dy = ball.yPos - lightning.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + lightning.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Enforce global special-item cooldown
		let now = Date.now()
		if (now - lightningLastHitTime < SPECIAL_ITEM_COOLDOWN) {
			return
		}
		lightningLastHitTime = now

		// Clear any existing special item effects
		bushEffectActive = false
		ballStoppedByBushEffect = false
		
		// Ball hit the lightning - activate pass-through for the rest of the try
		lightningEffectActive = true
		
		// Remove the lightning
		lightning = null
	}
}

function handleCollisionWithBush() {
	if (!bush) return
	
	let ballRadius = getBallRadius()
	let dx = ball.xPos - bush.xPos
	let dy = ball.yPos - bush.yPos
	let distance = Math.hypot(dx, dy)
	let collisionDistance = ballRadius + bush.radius
	
	if (distance < collisionDistance && distance > 0) {
		// Enforce global special-item cooldown
		let now = Date.now()
		if (now - bushLastHitTime < SPECIAL_ITEM_COOLDOWN) {
			return
		}
		bushLastHitTime = now

		// Clear any existing special item effects
		lightningEffectActive = false
		ballStoppedByBushEffect = false
		
		// Ball hit the bush - activate green border effect and stop the ball
		bushEffectActive = true
		ballStoppedByBushEffect = true
		
		// Stop the ball (user can fling again)
		ball.xVel = 0
		ball.yVel = 0
		ball.isBeingFlung = false
		
		// Remove the bush
		bush = null
	}
}

function handleCollisionWithWormhole() {
	if (!wormhole || wormhole.length !== 2) return
	
	// If ball is already in transit through a wormhole, ignore collisions
	if (wormholeTeleportPending) {
		return
	}
	
	let currentTime = Date.now()
	
	// Check if wormholes are disabled (2 seconds after last use)
	if (currentTime < wormholeDisabledUntil) {
		return
	}
	
	// Check cooldown - prevent immediate re-teleportation
	if (currentTime - wormholeLastTeleportTime < wormholeCooldown) {
		return
	}
	
	let ballRadius = getBallRadius()
	
	// Check collision with both wormholes
	for (let i = 0; i < wormhole.length; i++) {
		let wh = wormhole[i]
		if (!wh) continue
		
		let dx = ball.xPos - wh.xPos
		let dy = ball.yPos - wh.yPos
		let distance = Math.hypot(dx, dy)
		let collisionDistance = ballRadius + wh.radius
		
		if (distance < collisionDistance && distance > 0) {
			// Clear any existing special item effects and activate wormhole border
			lightningEffectActive = false
			bushEffectActive = false
			wormholeEffectActive = true
			ballStoppedByBushEffect = false
			
			// Find the other wormhole
			let otherWormhole = wormhole[1 - i]
			
			if (otherWormhole) {
				// Save the ball's current velocity before teleporting
				let savedXVel = ball.xVel
				let savedYVel = ball.yVel
				
				// Calculate direction vector from velocity (normalized)
				let speed = Math.hypot(savedXVel, savedYVel)
				let offsetDistance = ballRadius + otherWormhole.radius + 5 // Small buffer
				
				let destX, destY
				if (speed > 0) {
					// Offset in direction of velocity to place ball just outside collision radius
					let dirX = savedXVel / speed
					let dirY = savedYVel / speed
					destX = otherWormhole.xPos + dirX * offsetDistance
					destY = otherWormhole.yPos + dirY * offsetDistance
				} else {
					// If no velocity, just place it at wormhole position (shouldn't happen normally)
					destX = otherWormhole.xPos
					destY = otherWormhole.yPos
				}
				
				// Hide the ball and store teleport info for delayed teleportation
				ball.fadeOpacity = 0 // Hide ball during transit
				ball.xVel = 0 // Stop movement during transit
				ball.yVel = 0
				
				// Store teleport destination info
				wormholeTeleportPending = {
					startTime: currentTime,
					destX: destX,
					destY: destY,
					xVel: savedXVel,
					yVel: savedYVel
				}
				
				// Set cooldown to prevent immediate re-teleportation
				wormholeLastTeleportTime = currentTime
				
				// Disable both wormholes for 2 seconds after use
				wormholeDisabledUntil = currentTime + 2000
			}
			
			// Don't remove wormholes - they can be used multiple times
			break
		}
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
		// Ball hit the door - stop the ball and make both disappear
		// Prevent multiple collisions
		if (trophy.hit) return
		trophy.hit = true
		
		// Stop the ball at the collision point
		ball.xVel = 0
		ball.yVel = 0
		ball.isBeingFlung = false
		
		// Position ball at the door's center (so it overlaps perfectly)
		ball.xPos = trophy.xPos
		ball.yPos = trophy.yPos
		
		// Fade out tutorial steps 2 and 4
		let tutorialOverlay = document.getElementById("tutorialOverlay")
		if (tutorialOverlay && tutorialOverlay.style.visibility === "visible") {
			if ((level === 1 && tutorialStep === 2) || (level === 2 && tutorialStep === 4)) {
				tutorialOverlay.style.opacity = "0"
			}
		}
		// Also fade out the extra "then collect the trophy" hint if it's visible
		let hint = document.getElementById("trophyHintOverlay")
		if (hint && hint.style.visibility === "visible") {
			hint.style.opacity = "0"
		}
		
		// Start fade-out animation for ball immediately
		ballFadeOutStartTime = Date.now()
		doorFadeOutStartTime = null // Door will fade out after ball is fully faded
		ballHiddenForNextLevel = true // Keep ball hidden during delay
		pendingNextLevel = false
		
		// Mark that we've completed at least one level so future levels
		// can animate the ball into its starting spot
		hasCompletedALevel = true
		// Tutorial only runs on level 1; mark it completed after finishing that level
		if (level === 1 && !tutorialCompleted) {
			tutorialCompleted = true
			tutorialStep = 0
			updateTutorial()
		}
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	
	// Handle ball fade-out FIRST (takes precedence over everything else)
	if (ballFadeOutStartTime !== null) {
		let elapsed = Date.now() - ballFadeOutStartTime
		let fadeDuration = 500 // 0.5 seconds to fade out
		let t = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
		ball.fadeOpacity = t
		
		// After ball fade-out completes, start door fade-out
		if (elapsed >= fadeDuration && doorFadeOutStartTime === null && trophy) {
			doorFadeOutStartTime = Date.now()
		}
	} else {
		// Handle ball fade-in after level elements have faded in (works for all levels including first)
		if (ball && ball.fadeInStartTime !== undefined && ball.fadeInStartTime <= Date.now()) {
			// Handle ball fade-in after level elements have faded in
			// If ball is spawning, fade in during spawn animation; otherwise fade in normally
			let fadeInStart = ball.fadeInStartTime
			// If spawning, use spawn start time if it's later (so fade happens during spawn)
			if (ball.isSpawningToStart && ball.spawnStartTime > fadeInStart) {
				fadeInStart = ball.spawnStartTime
			}
			let elapsed = Date.now() - fadeInStart
			let fadeDuration = FADE_DURATION
			let t = Math.min(1.0, Math.max(0.0, elapsed / fadeDuration))
			if (!wormholeTeleportPending && !ballHiddenForNextLevel) {
				ball.fadeOpacity = t
			}
			
			// Clear fade-in start time once fade-in is complete
			if (t >= 1.0) {
				ball.fadeInStartTime = undefined
				// Track when ball faded in on level 1 (for hint timing)
				if (level === 1 && level1BallFadeInTime === null) {
					level1BallFadeInTime = Date.now()
				}
				// Start fade-out for starting door when ball fade-in is complete
				if (startingDoor && startingDoor.fadeOutStartTime === null) {
					startingDoor.fadeOutStartTime = Date.now()
					// Start hint fade-in 1 second after door fade-out starts (only on level 3)
					if (level === 3 && !hasExecutedSwap && level3HintFadeInStartTime === null) {
						level3HintFadeInStartTime = startingDoor.fadeOutStartTime + 1000
					}
				}
				// Also clear initial intro flag if this was the first level
				if (initialIntroActive && !hasCompletedALevel) {
					initialIntroActive = false
				}
			}
		} else if (!wormholeTeleportPending && !ballHiddenForNextLevel) {
			// Ensure ball is fully visible after fade-in completes
			if (ball && ball.fadeInStartTime === undefined) {
				ball.fadeOpacity = 1.0
			}
		}
	}
	
	// Update starting door fade-in and fade-out
	if (startingDoor) {
		if (startingDoor.fadeOutStartTime !== null) {
			// Handle fade-out
			let elapsed = Date.now() - startingDoor.fadeOutStartTime
			let fadeDuration = FADE_DURATION // Match fade-in duration
			startingDoor.fadeInOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
			
			// Clear starting door after fade-out completes
			if (elapsed >= fadeDuration) {
				// Start level 10 hint fade-in 1 second after door fades out
				if (level === 10 && level10HintFadeInStartTime === null) {
					level10HintFadeInStartTime = Date.now() + 1000
				}
				startingDoor = null
			}
		} else if (startingDoor.fadeInStartTime !== undefined && startingDoor.fadeInStartTime <= Date.now()) {
			// Handle fade-in
			let elapsed = Date.now() - startingDoor.fadeInStartTime
			let fadeDuration = FADE_DURATION
			startingDoor.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
	}
	
	// Update fade-in for targets
	for (let i = 0; i < targetsRemaining.length; i++) {
		let target = targetsRemaining[i]
		// Update fade-in only if start time has passed (fade-in should already be initialized in generateLevel)
		if (target.fadeInOpacity < 1.0 && target.fadeInStartTime !== undefined && target.fadeInStartTime <= Date.now()) {
			let elapsed = Date.now() - target.fadeInStartTime
			let fadeDuration = FADE_DURATION
			target.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
	}
	
	// Update fade-in and fade-out for obstacles
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		
		// Handle fade-in - only update if start time has passed (fade-in should already be initialized in generateLevel)
		if (obstacle.fadeInOpacity < 1.0 && obstacle.fadeInStartTime !== undefined && obstacle.fadeInStartTime <= Date.now()) {
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
	drawLightning()
	drawBush()
	drawWormholes()
	
	// Draw starting door behind the ball
	drawStartingDoor()
	
	// Draw ball after targets and obstacles so it appears on top
	drawBall()
	
	// Draw cross, star, and switcher after ball so they appear on top
	drawStar()
	drawSwitcher()
	drawCross()
	
	// Update trophy fade-in and fade-out
	if (trophy) {
		if (doorFadeOutStartTime !== null) {
			// Handle door fade-out - starts after ball is fully faded
			let elapsed = Date.now() - doorFadeOutStartTime
			let fadeDuration = 500 // 0.5 seconds to fade out
			trophy.fadeInOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
			
			// After door fade-out completes, wait 1 second then start next level
			if (elapsed >= fadeDuration) {
				trophy = null
				doorFadeOutStartTime = null
				// Start next level after door fade-out completes
				if (!isGeneratingLevel) {
					isGeneratingLevel = true
					setTimeout(() => {
						ballFadeOutStartTime = null
						ballHiddenForNextLevel = false
						generateLevel()
					}, 1000)
				}
			}
		} else if (trophy.fadeInOpacity !== undefined && trophy.fadeInOpacity < 1.0) {
			// Handle fade-in
			let elapsed = Date.now() - trophy.fadeInStartTime
			let fadeDuration = 1000 // 1.0 seconds to fade in (slower)
			trophy.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
	}
	
	// Draw the score first, then draw the door on top of everything (z-order)
	drawCompletionScore()
	drawTrophy()
	
	// Draw selection line between selected sprite and ball
	drawSelectionLine()
	
	// Draw electric lines during swap animations
	drawSwapAnimationLines()
	
	// Draw victory drawing (user can draw when trophy is hit)
	drawVictoryDrawing()
	
	// Draw level 3 swap hint if user hasn't swapped yet
	drawLevel3SwapHint()
	
	// Draw level 2 hint if tries > 2
	drawLevel2Hint()
	
	// Draw level 1 hint if 10 seconds passed and tries == 0
	drawLevel1Hint()
	
	// Draw level 10 hint
	drawLevel10Hint()
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
	let pos = getSwapAnimatedPosition(ball)
	let x = pos.x
	let y = pos.y
	
	// Apply fade opacity
	ctx.save()
	ctx.globalAlpha = ball.fadeOpacity !== undefined ? ball.fadeOpacity : 1.0

	// Teal sphere with subtle gradient
	let gradient = ctx.createRadialGradient(
		x - radius * 0.5, y - radius * 0.5, 0,
		x, y, radius
	)
	gradient.addColorStop(0, "#4dd0e1") // Light teal
	gradient.addColorStop(1, "#00838f") // Dark teal
	
	ctx.beginPath()
	ctx.arc(x, y, radius, 0, 2 * Math.PI)
	ctx.fillStyle = gradient
	ctx.fill()
	
	// Draw smiley face
	// Eyes
	ctx.fillStyle = "#000000"
	let eyeSize = radius * 0.12
	let eyeY = y - radius * 0.2
	let eyeSpacing = radius * 0.3
	
	// Left eye
	ctx.beginPath()
	ctx.arc(x - eyeSpacing, eyeY, eyeSize, 0, 2 * Math.PI)
	ctx.fill()
	
	// Right eye
	ctx.beginPath()
	ctx.arc(x + eyeSpacing, eyeY, eyeSize, 0, 2 * Math.PI)
	ctx.fill()
	
	// Smile
	let mouthY = y + radius * 0.15
	let mouthWidth = radius * 0.4
	
	ctx.strokeStyle = "#000000"
	ctx.lineWidth = Math.max(2, radius * 0.08)
	ctx.lineCap = "round"
	ctx.beginPath()
	
	// Normal closed smile
	ctx.arc(x, mouthY, mouthWidth, 0.2, Math.PI - 0.2, false)
	ctx.stroke()
	
	// Draw orange border if lightning effect is active
	if (lightningEffectActive) {
		ctx.strokeStyle = "#ff8800"
		ctx.lineWidth = radius * 0.15
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.stroke()
	}
	
	// Draw green border if bush effect is active
	if (bushEffectActive) {
		ctx.strokeStyle = "#228833"
		ctx.lineWidth = radius * 0.15
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.stroke()
	}
	
	// Draw purple border if wormhole effect is active
	if (wormholeEffectActive) {
		ctx.strokeStyle = "#aa55ff"
		ctx.lineWidth = radius * 0.15
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.stroke()
	}
	

	ctx.restore()
}

function drawLightning() {
	if (!lightning) return
	
	let radius = lightning.radius
	let animPos = getSwapAnimatedPosition(lightning)
	let x = animPos.x
	let y = animPos.y
	
	// Initialize fade-in if missing
	if (lightning.fadeInOpacity === undefined || lightning.fadeInStartTime === undefined) {
		lightning.fadeInOpacity = 0
		lightning.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (lightning.fadeInOpacity < 1.0 && lightning.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - lightning.fadeInStartTime
		let fadeDuration = FADE_DURATION
		lightning.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, lightning.fadeInOpacity !== undefined ? lightning.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw lightning bolt from image
	if (lightningImage && lightningImage.complete) {
		let size = radius * 12
		let imgX = x - size / 2
		let imgY = y - size / 2
		
		// Use temporary canvas to avoid affecting other sprites
		let tempCanvas = document.createElement('canvas')
		tempCanvas.width = size
		tempCanvas.height = size
		let tempCtx = tempCanvas.getContext('2d')
		
		// Draw image on temp canvas
		tempCtx.drawImage(lightningImage, 0, 0, size, size)
		
		// Fill with solid orange (less red) to remove gradient
		tempCtx.globalCompositeOperation = 'source-atop'
		tempCtx.fillStyle = '#bb6622' // Darker orange, less red
		tempCtx.fillRect(0, 0, size, size)
		
		// Draw the processed image to main canvas
		ctx.drawImage(tempCanvas, imgX, imgY)
	} else {
		// Fallback: draw orange circle if image not loaded yet
		ctx.fillStyle = "#ff8800"
		ctx.beginPath()
		ctx.arc(x, y, radius, 0, 2 * Math.PI)
		ctx.fill()
	}
	
	ctx.restore()
}

function drawBush() {
	if (!bush) return
	
	let radius = bush.radius
	let animPos = getSwapAnimatedPosition(bush)
	let x = animPos.x
	let y = animPos.y
	
	// Initialize fade-in if missing
	if (bush.fadeInOpacity === undefined || bush.fadeInStartTime === undefined) {
		bush.fadeInOpacity = 0
		bush.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (bush.fadeInOpacity < 1.0 && bush.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - bush.fadeInStartTime
		let fadeDuration = FADE_DURATION
		bush.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, bush.fadeInOpacity !== undefined ? bush.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw green bush - rounded shape with leafy texture
	// Removed dark green background circle
	
	// Draw some leaf details (slightly larger so bush silhouette matches ball size)
	ctx.fillStyle = "#33aa44"
	// Top leaf
	ctx.beginPath()
	ctx.ellipse(x, y - radius * 0.5, radius * 0.5, radius * 0.4, -0.3, 0, 2 * Math.PI)
	ctx.fill()
	// Left leaf
	ctx.beginPath()
	ctx.ellipse(x - radius * 0.55, y, radius * 0.4, radius * 0.5, 0.5, 0, 2 * Math.PI)
	ctx.fill()
	// Right leaf
	ctx.beginPath()
	ctx.ellipse(x + radius * 0.55, y, radius * 0.4, radius * 0.5, -0.5, 0, 2 * Math.PI)
	ctx.fill()
	// Bottom leaf
	ctx.beginPath()
	ctx.ellipse(x, y + radius * 0.5, radius * 0.5, radius * 0.4, 0.3, 0, 2 * Math.PI)
	ctx.fill()
	
	ctx.restore()
}

function drawWormholes() {
	if (!wormhole || wormhole.length !== 2) return
	
	// Store positions and opacities for drawing connecting line
	let positions = []
	
	// Draw both wormholes as glowing circular portals (original design)
	for (let i = 0; i < wormhole.length; i++) {
		let wh = wormhole[i]
		if (!wh) continue
		
		let radius = wh.radius
		let animPos = getSwapAnimatedPosition(wh)
		let x = animPos.x
		let y = animPos.y
		
		// Initialize fade-in if missing
		if (wh.fadeInOpacity === undefined || wh.fadeInStartTime === undefined) {
			wh.fadeInOpacity = 0
			wh.fadeInStartTime = Date.now() + FADE_IN_DELAY
		}
		
		// Update fade-in only if start time has passed
		if (wh.fadeInOpacity < 1.0 && wh.fadeInStartTime <= Date.now()) {
			let elapsed = Date.now() - wh.fadeInStartTime
			let fadeDuration = FADE_DURATION
			wh.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
		}
		
		let opacity = Math.max(0, Math.min(1.0, wh.fadeInOpacity !== undefined ? wh.fadeInOpacity : 0))
		
		// Store position for connecting line
		positions.push({ x, y, opacity })
		
		ctx.save()
		ctx.globalAlpha = opacity
		
		// Outer soft glow
		let glowRadius = radius * 1.4
		let glowGradient = ctx.createRadialGradient(
			x, y, radius * 0.2,
			x, y, glowRadius
		)
		glowGradient.addColorStop(0, "rgba(190, 120, 255, 0.9)")
		glowGradient.addColorStop(0.5, "rgba(150, 80, 220, 0.6)")
		glowGradient.addColorStop(1, "rgba(50, 0, 90, 0)")
		ctx.beginPath()
		ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
		ctx.fillStyle = glowGradient
		ctx.fill()
		
		// Main ring
		let outerRadius = radius
		let innerRadius = radius * 0.5
		let ringGradient = ctx.createRadialGradient(
			x - radius * 0.3, y - radius * 0.3, innerRadius * 0.2,
			x, y, outerRadius
		)
		ringGradient.addColorStop(0, "#ffe6ff")
		ringGradient.addColorStop(0.35, "#cc99ff")
		ringGradient.addColorStop(0.7, "#7733aa")
		ringGradient.addColorStop(1, "#330055")
		
		ctx.beginPath()
		ctx.arc(x, y, outerRadius, 0, Math.PI * 2)
		ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true)
		ctx.fillStyle = ringGradient
		ctx.fill()
		
		// Bright inner edge
		ctx.beginPath()
		ctx.arc(x, y, innerRadius, 0, Math.PI * 2)
		ctx.strokeStyle = "rgba(255, 255, 255, 0.9)"
		ctx.lineWidth = Math.max(2, radius * 0.12)
		ctx.stroke()
		
		ctx.restore()
	}
	
	// Draw a subtle connecting beam between the two wormholes
	if (positions.length === 2) {
		let a = positions[0]
		let b = positions[1]
		let beamOpacity = Math.min(a.opacity, b.opacity)
		
		ctx.save()
		ctx.globalAlpha = beamOpacity * 0.7
		
		let gradient = ctx.createLinearGradient(a.x, a.y, b.x, b.y)
		gradient.addColorStop(0, "rgba(190, 120, 255, 0.0)")
		gradient.addColorStop(0.25, "rgba(210, 140, 255, 0.9)")
		gradient.addColorStop(0.5, "rgba(255, 200, 255, 1.0)")
		gradient.addColorStop(0.75, "rgba(210, 140, 255, 0.9)")
		gradient.addColorStop(1, "rgba(190, 120, 255, 0.0)")
		
		ctx.beginPath()
		ctx.moveTo(a.x, a.y)
		ctx.lineTo(b.x, b.y)
		ctx.strokeStyle = gradient
		ctx.lineWidth = Math.max(3, getBallRadius() * 0.25)
		ctx.stroke()
		
		ctx.restore()
	}
}

function drawTargets() {
	for (let i=0; i<targetsRemaining.length; i++) {
		let target = targetsRemaining[i]
		let radius = getTargetRadius()
		let pos = getSwapAnimatedPosition(target)
		let x = pos.x
		let y = pos.y
		
		// Get opacity - ONLY show if fadeInStartTime has passed
		let now = Date.now()
		let opacity = 0
		if (typeof target.fadeInStartTime === 'number' && target.fadeInStartTime <= now) {
			opacity = (typeof target.fadeInOpacity === 'number') ? target.fadeInOpacity : 0
		}
		
		ctx.save()
		ctx.globalAlpha = opacity
		
		// Draw trophy scaled to match visual size of other objects (ball, obstacles)
		// Scale factor to make trophy appear as large as a circle with the same radius
		let scale = 1.6
		let scaledRadius = radius * scale
		
		// Draw trophy in gold/yellow with gradient
		let gradient = ctx.createLinearGradient(x, y - scaledRadius, x, y + scaledRadius)
		gradient.addColorStop(0, "#ffed4e") // Lighter gold at top
		gradient.addColorStop(0.5, "#ffd700") // Gold in middle
		gradient.addColorStop(1, "#daa520") // Darker gold at bottom
		ctx.fillStyle = gradient
		ctx.strokeStyle = "#b8860b" // Dark gold for outline
		ctx.lineWidth = Math.max(1, radius * 0.1)
		
		// Trophy base (bottom, wider and perfectly centered)
		let baseWidth = scaledRadius * 1.0
		let baseHeight = scaledRadius * 0.15
		let baseY = y + scaledRadius * 0.35
		ctx.beginPath()
		ctx.rect(x - baseWidth / 2, baseY, baseWidth, baseHeight)
		ctx.fill()
		ctx.stroke()
		
		// Trophy stem/pedestal (connects base to cup, perfectly centered)
		let stemWidth = scaledRadius * 0.3
		let stemHeight = scaledRadius * 0.2
		let stemY = y + scaledRadius * 0.15
		ctx.beginPath()
		ctx.rect(x - stemWidth / 2, stemY, stemWidth, stemHeight)
		ctx.fill()
		ctx.stroke()
		
		// Trophy cup/bowl (main body, perfectly symmetrical)
		let cupBottomY = stemY
		let cupTopY = y - scaledRadius * 0.3
		let cupBottomWidth = scaledRadius * 0.4
		let cupTopWidth = scaledRadius * 0.7
		let cupInnerTopWidth = scaledRadius * 0.4
		
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
		ctx.lineTo(x - cupInnerTopWidth / 2, cupTopY + scaledRadius * 0.1)
		// Inner bottom curve (symmetric)
		ctx.quadraticCurveTo(x, cupTopY + scaledRadius * 0.15, x + cupInnerTopWidth / 2, cupTopY + scaledRadius * 0.1)
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
		let handleRadius = scaledRadius * 0.2
		let handleXOffset = scaledRadius * 0.45
		let handleY = y - scaledRadius * 0.05
		let handleThickness = scaledRadius * 0.12
		
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
		ctx.lineWidth = Math.max(1, radius * 0.05)
		ctx.beginPath()
		let starX = x
		let starY = y - scaledRadius * 0.4
		let starOuterRadius = scaledRadius * 0.15
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
}

function drawObstacles() {
	for (let i = 0; i < obstacles.length; i++) {
		let obstacle = obstacles[i]
		let radius = obstacle.radius
		let animPos = getSwapAnimatedPosition(obstacle)
		let x = animPos.x
		let y = animPos.y
		
		// Get opacity based on fade-in/fade-out state
		let opacity = obstacle.fadeInOpacity !== undefined ? obstacle.fadeInOpacity : 0
		
		// Fade-out takes priority over fade-in
		if (obstacle.fading && obstacle.fadeOpacity !== undefined) {
			opacity = Math.max(0, Math.min(1.0, obstacle.fadeOpacity))
		}
		
		ctx.save()
		ctx.globalAlpha = opacity
		
		// Draw rock with irregular shape
		// Use a seed based on obstacle position for consistent shape per obstacle
		let seed = (obstacle.xPos * 7 + obstacle.yPos * 11) % 1000
		let points = 8 // Number of points for irregular polygon
		let angles = []
		let distances = []
		
		// Generate irregular angles and distances for rock shape
		for (let p = 0; p < points; p++) {
			let angleSeed = (seed + p * 137) % 1000
			let distSeed = (seed + p * 211) % 1000
			angles.push((p * 2 * Math.PI / points) + (angleSeed / 1000 - 0.5) * 0.4)
			distances.push(radius * (0.7 + (distSeed / 1000) * 0.3))
		}
		
		// Draw rock shape
		ctx.beginPath()
		for (let p = 0; p < points; p++) {
			let px = x + Math.cos(angles[p]) * distances[p]
			let py = y + Math.sin(angles[p]) * distances[p]
			if (p === 0) {
				ctx.moveTo(px, py)
			} else {
				ctx.lineTo(px, py)
			}
		}
		ctx.closePath()
		
		// Rock gradient (earthy brown/gray)
		let gradient = ctx.createRadialGradient(
			x - radius * 0.3, y - radius * 0.3, 0,
			x, y, radius
		)
		gradient.addColorStop(0, "#8b7355")
		gradient.addColorStop(0.5, "#6b5d4a")
		gradient.addColorStop(1, "#4a3d2e")
		
		ctx.fillStyle = gradient
		ctx.fill()
		
		// Add some texture with darker lines
		ctx.strokeStyle = "#3a2d1e"
		ctx.lineWidth = 1.5
		ctx.stroke()
		
		// Add a few highlight spots for texture
		ctx.fillStyle = "#9b8365"
		for (let h = 0; h < 3; h++) {
			let highlightSeed = (seed + h * 313) % 1000
			let hx = x + (highlightSeed / 1000 - 0.5) * radius * 0.6
			let hy = y + ((highlightSeed * 7) % 1000 / 1000 - 0.5) * radius * 0.6
			ctx.beginPath()
			ctx.arc(hx, hy, radius * 0.15, 0, 2 * Math.PI)
			ctx.fill()
		}
		
		ctx.restore()
	}
}

function drawStar() {
	if (!star) return
	
	let radius = star.radius
	let animPos = getSwapAnimatedPosition(star)
	let x = animPos.x
	let y = animPos.y
	
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
	// Slightly larger visual star while keeping collision radius the same
	let outerRadius = radius * 1.15
	let innerRadius = radius * 0.46
	
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
	let animPos = getSwapAnimatedPosition(switcher)
	let x = animPos.x
	let y = animPos.y
	
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
	// Make the visible arrows larger so the switcher silhouette matches the ball size
	let circleRadius = radius * 0.7 // Larger circular path so arrows extend closer to edge
	let arrowThickness = radius * 0.3 // Slightly thicker arrow body
	let arrowHeadSize = radius * 0.5 // Larger arrowhead for stronger visual
	let gapSize = Math.PI * 0.35 // Gap between arrows (larger gap for better visibility)
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
	
	// Draw top arrowhead (pointing right) - symmetrical triangle
	let topArrowHeadX = Math.cos(topArrowEndAngle) * circleRadius
	let topArrowHeadY = Math.sin(topArrowEndAngle) * circleRadius
	ctx.save()
	ctx.translate(topArrowHeadX, topArrowHeadY)
	ctx.rotate(topArrowEndAngle + Math.PI / 2) // Point along the tangent
	ctx.beginPath()
	ctx.moveTo(arrowHeadSize * 1.2, 0) // Tip of arrow (pointing forward along arrow line)
	ctx.lineTo(0, -arrowHeadSize * 0.7) // Base point on one side
	ctx.lineTo(0, arrowHeadSize * 0.7) // Base point on other side (symmetric)
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
	
	// Draw bottom arrowhead (pointing left) - symmetrical triangle
	let bottomArrowHeadX = Math.cos(bottomArrowEndAngle) * circleRadius
	let bottomArrowHeadY = Math.sin(bottomArrowEndAngle) * circleRadius
	ctx.save()
	ctx.translate(bottomArrowHeadX, bottomArrowHeadY)
	ctx.rotate(bottomArrowEndAngle + Math.PI / 2) // Point along the tangent
	ctx.beginPath()
	ctx.moveTo(arrowHeadSize * 1.2, 0) // Tip of arrow (pointing forward along arrow line, away from arrow)
	ctx.lineTo(0, -arrowHeadSize * 0.7) // Base point on one side
	ctx.lineTo(0, arrowHeadSize * 0.7) // Base point on other side (symmetric)
	ctx.closePath()
	ctx.fill()
	ctx.restore()
	ctx.restore()
	
	ctx.restore()
}

function drawCross() {
	if (!cross) return
	
	let radius = cross.radius
	let animPos = getSwapAnimatedPosition(cross)
	let x = animPos.x
	let y = animPos.y
	
	// Initialize fade-in if missing
	if (cross.fadeInOpacity === undefined || cross.fadeInStartTime === undefined) {
		cross.fadeInOpacity = 0
		cross.fadeInStartTime = Date.now() + FADE_IN_DELAY
	}
	
	// Update fade-in only if start time has passed
	if (cross.fadeInOpacity < 1.0 && cross.fadeInStartTime <= Date.now()) {
		let elapsed = Date.now() - cross.fadeInStartTime
		let fadeDuration = FADE_DURATION
		cross.fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	}
	
	let opacity = Math.max(0, Math.min(1.0, cross.fadeInOpacity !== undefined ? cross.fadeInOpacity : 0))
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw white X (slightly larger than collision radius for visual emphasis)
	ctx.strokeStyle = "#ffffff"
	ctx.fillStyle = "#ffffff"
	ctx.lineWidth = radius * 0.3
	ctx.lineCap = "round"
	
	// First diagonal line (top-left to bottom-right)
	ctx.beginPath()
	ctx.moveTo(x - radius * 0.6, y - radius * 0.6)
	ctx.lineTo(x + radius * 0.6, y + radius * 0.6)
	ctx.stroke()
	
	// Second diagonal line (top-right to bottom-left)
	ctx.beginPath()
	ctx.moveTo(x + radius * 0.6, y - radius * 0.6)
	ctx.lineTo(x - radius * 0.6, y + radius * 0.6)
	ctx.stroke()
	
	ctx.restore()
}

function drawStartingDoor() {
	if (!startingDoor) return
	
	let radius = startingDoor.radius
	let x = startingDoor.xPos
	let y = startingDoor.yPos
	
	// Get opacity (fade-in, fade-out, or default to 1.0)
	let opacity = startingDoor.fadeInOpacity !== undefined ? startingDoor.fadeInOpacity : 1.0
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw small door (scaled down version of the trophy door)
	let doorWidth = radius * 1.2
	let doorHeight = radius * 2.0
	let doorTop = y - doorHeight / 2
	let doorLeft = x - doorWidth / 2
	
	// Door frame (darker brown)
	ctx.fillStyle = "#5d4037"
	ctx.strokeStyle = "#3e2723"
	ctx.lineWidth = Math.max(2, radius * 0.1)
	ctx.beginPath()
	ctx.rect(doorLeft - radius * 0.1, doorTop - radius * 0.1, doorWidth + radius * 0.2, doorHeight + radius * 0.2)
	ctx.fill()
	ctx.stroke()
	
	// Door panel (brown wood)
	let doorGradient = ctx.createLinearGradient(doorLeft, doorTop, doorLeft + doorWidth, doorTop + doorHeight)
	doorGradient.addColorStop(0, "#8d6e63")
	doorGradient.addColorStop(0.5, "#6d4c41")
	doorGradient.addColorStop(1, "#5d4037")
	ctx.fillStyle = doorGradient
	ctx.strokeStyle = "#3e2723"
	ctx.lineWidth = Math.max(1, radius * 0.08)
	ctx.beginPath()
	ctx.rect(doorLeft, doorTop, doorWidth, doorHeight)
	ctx.fill()
	ctx.stroke()
	
	// Door handle (brass/gold)
	ctx.fillStyle = "#d4af37"
	ctx.strokeStyle = "#b8860b"
	ctx.lineWidth = Math.max(1, radius * 0.05)
	let handleX = doorLeft + doorWidth * 0.85
	let handleY = y
	let handleSize = radius * 0.15
	ctx.beginPath()
	ctx.arc(handleX, handleY, handleSize, 0, 2 * Math.PI)
	ctx.fill()
	ctx.stroke()
	
	// Door panels (decorative lines)
	ctx.strokeStyle = "#4e342e"
	ctx.lineWidth = Math.max(1, radius * 0.06)
	// Vertical line down the middle
	ctx.beginPath()
	ctx.moveTo(x, doorTop)
	ctx.lineTo(x, doorTop + doorHeight)
	ctx.stroke()
	// Horizontal lines (top, middle, bottom)
	ctx.beginPath()
	ctx.moveTo(doorLeft, doorTop + doorHeight * 0.33)
	ctx.lineTo(doorLeft + doorWidth, doorTop + doorHeight * 0.33)
	ctx.moveTo(doorLeft, doorTop + doorHeight * 0.67)
	ctx.lineTo(doorLeft + doorWidth, doorTop + doorHeight * 0.67)
	ctx.stroke()
	
	ctx.restore()
}

function drawTrophy() {
	if (!trophy) return
	
	let radius = trophy.radius
	let animPos = getSwapAnimatedPosition(trophy)
	let x = animPos.x
	let y = animPos.y
	
	// Get opacity (fade-in, fade-out, or default to 1.0)
	let opacity = trophy.fadeInOpacity !== undefined ? trophy.fadeInOpacity : 1.0
	
	ctx.save()
	ctx.globalAlpha = opacity
	
	// Draw door
	let doorWidth = radius * 1.2
	let doorHeight = radius * 2.0
	let doorTop = y - doorHeight / 2
	let doorLeft = x - doorWidth / 2
	
	// Door frame (darker brown)
	ctx.fillStyle = "#5d4037"
	ctx.strokeStyle = "#3e2723"
	ctx.lineWidth = Math.max(3, radius * 0.1)
	ctx.beginPath()
	ctx.rect(doorLeft - radius * 0.1, doorTop - radius * 0.1, doorWidth + radius * 0.2, doorHeight + radius * 0.2)
	ctx.fill()
	ctx.stroke()
	
	// Door panel (brown wood)
	let doorGradient = ctx.createLinearGradient(doorLeft, doorTop, doorLeft + doorWidth, doorTop + doorHeight)
	doorGradient.addColorStop(0, "#8d6e63")
	doorGradient.addColorStop(0.5, "#6d4c41")
	doorGradient.addColorStop(1, "#5d4037")
	ctx.fillStyle = doorGradient
	ctx.strokeStyle = "#3e2723"
	ctx.lineWidth = Math.max(2, radius * 0.08)
	ctx.beginPath()
	ctx.rect(doorLeft, doorTop, doorWidth, doorHeight)
	ctx.fill()
	ctx.stroke()
	
	// Door handle (brass/gold)
	ctx.fillStyle = "#d4af37"
	ctx.strokeStyle = "#b8860b"
	ctx.lineWidth = Math.max(1, radius * 0.05)
	let handleX = doorLeft + doorWidth * 0.85
	let handleY = y
	let handleSize = radius * 0.15
	ctx.beginPath()
	ctx.arc(handleX, handleY, handleSize, 0, 2 * Math.PI)
	ctx.fill()
	ctx.stroke()
	
	// Door panels/panels (decorative lines)
	ctx.strokeStyle = "#4e342e"
	ctx.lineWidth = Math.max(1, radius * 0.06)
	// Vertical line down the middle
	ctx.beginPath()
	ctx.moveTo(x, doorTop)
	ctx.lineTo(x, doorTop + doorHeight)
	ctx.stroke()
	// Horizontal lines (top, middle, bottom)
	ctx.beginPath()
	ctx.moveTo(doorLeft, doorTop + doorHeight * 0.33)
	ctx.lineTo(doorLeft + doorWidth, doorTop + doorHeight * 0.33)
	ctx.stroke()
	ctx.beginPath()
	ctx.moveTo(doorLeft, doorTop + doorHeight * 0.67)
	ctx.lineTo(doorLeft + doorWidth, doorTop + doorHeight * 0.67)
	ctx.stroke()
	
	ctx.restore()
}

function drawSelectionLine() {
	if (!selectedForConversion) return
	
	// Get the position of the selected sprite
	let spriteX, spriteY
	let spriteType = selectedForConversion.type
	let spriteIndex = selectedForConversion.index
	
	if (spriteType === 'target') {
		let target = targetsRemaining[spriteIndex]
		if (!target) return
		spriteX = target.xPos
		spriteY = target.yPos
	} else if (spriteType === 'obstacle') {
		let obstacle = obstacles[spriteIndex]
		if (!obstacle) return
		spriteX = obstacle.xPos
		spriteY = obstacle.yPos
	} else if (spriteType === 'star') {
		if (!star) return
		spriteX = star.xPos
		spriteY = star.yPos
	} else if (spriteType === 'switcher') {
		if (!switcher) return
		spriteX = switcher.xPos
		spriteY = switcher.yPos
	} else if (spriteType === 'cross') {
		if (!cross) return
		spriteX = cross.xPos
		spriteY = cross.yPos
	} else if (spriteType === 'lightning') {
		if (!lightning) return
		spriteX = lightning.xPos
		spriteY = lightning.yPos
	} else if (spriteType === 'bush') {
		if (!bush) return
		spriteX = bush.xPos
		spriteY = bush.yPos
	} else if (spriteType === 'wormhole') {
		if (!wormhole || !wormhole[spriteIndex]) return
		spriteX = wormhole[spriteIndex].xPos
		spriteY = wormhole[spriteIndex].yPos
	} else if (spriteType === 'trophy') {
		if (!trophy) return
		spriteX = trophy.xPos
		spriteY = trophy.yPos
	} else if (spriteType === 'ball') {
		// Ball is selected, no line to draw (ball to itself)
		return
	} else {
		return
	}
	
	let ballX = ball.xPos
	let ballY = ball.yPos
	
	ctx.save()
	
	// Calculate distance and direction
	let dx = ballX - spriteX
	let dy = ballY - spriteY
	let distance = Math.hypot(dx, dy)
	
	if (distance < 1) {
		ctx.restore()
		return
	}
	
	// Normalize direction
	let nx = dx / distance
	let ny = dy / distance
	// Perpendicular direction for offsets
	let px = -ny
	let py = nx
	
	// Time-based animation for electricity flicker
	let time = Date.now() * 0.01
	
	// Draw glow effect (outer layer)
	ctx.strokeStyle = "rgba(0, 255, 100, 0.3)"
	ctx.lineWidth = 8
	ctx.lineCap = "round"
	ctx.lineJoin = "round"
	ctx.beginPath()
	ctx.moveTo(spriteX, spriteY)
	ctx.lineTo(ballX, ballY)
	ctx.stroke()
	
	// Draw main electricity line with jagged segments
	let segments = Math.max(5, Math.floor(distance / 30))
	
	// Draw multiple electricity arcs for effect
	for (let arc = 0; arc < 3; arc++) {
		ctx.strokeStyle = arc === 0 ? "#00ff66" : "rgba(150, 255, 200, 0.6)"
		ctx.lineWidth = arc === 0 ? 2 : 1
		
		ctx.beginPath()
		ctx.moveTo(spriteX, spriteY)
		
		for (let i = 1; i < segments; i++) {
			let t = i / segments
			// Base position along the line
			let baseX = spriteX + dx * t
			let baseY = spriteY + dy * t
			
			// Add random offset perpendicular to the line (electricity jitter)
			// Use time and position to create animated noise
			let noise1 = Math.sin(time + i * 3.7 + arc * 2.1) * 0.5 + Math.sin(time * 1.3 + i * 2.3) * 0.5
			let noise2 = Math.cos(time * 0.8 + i * 4.1 + arc * 1.7) * 0.5 + Math.cos(time * 1.7 + i * 1.9) * 0.5
			let offset = (noise1 + noise2) * 12 * (1 - Math.abs(t - 0.5) * 2) // Stronger in middle
			
			let jitterX = baseX + px * offset
			let jitterY = baseY + py * offset
			
			ctx.lineTo(jitterX, jitterY)
		}
		
		ctx.lineTo(ballX, ballY)
		ctx.stroke()
	}
	
	// Draw bright core
	ctx.strokeStyle = "#aaffcc"
	ctx.lineWidth = 1
	ctx.beginPath()
	ctx.moveTo(spriteX, spriteY)
	ctx.lineTo(ballX, ballY)
	ctx.stroke()
	
	// Add small spark effects at both ends
	let sparkCount = 3
	for (let i = 0; i < sparkCount; i++) {
		let sparkAngle = time * 2 + i * (Math.PI * 2 / sparkCount)
		let sparkLen = 8 + Math.sin(time * 3 + i) * 4
		
		ctx.strokeStyle = "rgba(150, 255, 200, 0.8)"
		ctx.lineWidth = 1
		
		// Spark at sprite end
		ctx.beginPath()
		ctx.moveTo(spriteX, spriteY)
		ctx.lineTo(
			spriteX + Math.cos(sparkAngle) * sparkLen,
			spriteY + Math.sin(sparkAngle) * sparkLen
		)
		ctx.stroke()
		
		// Spark at ball end
		ctx.beginPath()
		ctx.moveTo(ballX, ballY)
		ctx.lineTo(
			ballX + Math.cos(sparkAngle + Math.PI) * sparkLen,
			ballY + Math.sin(sparkAngle + Math.PI) * sparkLen
		)
		ctx.stroke()
	}
	
	ctx.restore()
}

// Draw electric lines during swap animations
function drawSwapAnimationLines() {
	if (swapAnimations.length === 0) return
	
	// Get ball's animated position
	let ballAnimPos = getSwapAnimatedPosition(ball)
	let ballX = ballAnimPos.x
	let ballY = ballAnimPos.y
	
	// Draw lines from each animating sprite (except ball) to the ball
	for (let anim of swapAnimations) {
		if (anim.sprite === ball) continue
		
		let animPos = getSwapAnimatedPosition(anim.sprite)
		let spriteX = animPos.x
		let spriteY = animPos.y
		
		ctx.save()
		
		// Calculate distance and direction
		let dx = ballX - spriteX
		let dy = ballY - spriteY
		let distance = Math.hypot(dx, dy)
		
		if (distance < 1) {
			ctx.restore()
			continue
		}
		
		// Normalize direction
		let nx = dx / distance
		let ny = dy / distance
		// Perpendicular direction for offsets
		let px = -ny
		let py = nx
		
		// Time-based animation for electricity flicker
		let time = Date.now() * 0.01
		
		// Draw glow effect (outer layer)
		ctx.strokeStyle = "rgba(0, 255, 100, 0.3)"
		ctx.lineWidth = 8
		ctx.lineCap = "round"
		ctx.lineJoin = "round"
		ctx.beginPath()
		ctx.moveTo(spriteX, spriteY)
		ctx.lineTo(ballX, ballY)
		ctx.stroke()
		
		// Draw main electricity line with jagged segments
		let segments = Math.max(5, Math.floor(distance / 30))
		
		// Draw multiple electricity arcs for effect
		for (let arc = 0; arc < 3; arc++) {
			ctx.strokeStyle = arc === 0 ? "#00ff66" : "rgba(150, 255, 200, 0.6)"
			ctx.lineWidth = arc === 0 ? 2 : 1
			
			ctx.beginPath()
			ctx.moveTo(spriteX, spriteY)
			
			for (let i = 1; i < segments; i++) {
				let t = i / segments
				// Base position along the line
				let baseX = spriteX + dx * t
				let baseY = spriteY + dy * t
				
				// Add random offset perpendicular to the line (electricity jitter)
				let noise1 = Math.sin(time + i * 3.7 + arc * 2.1) * 0.5 + Math.sin(time * 1.3 + i * 2.3) * 0.5
				let noise2 = Math.cos(time * 0.8 + i * 4.1 + arc * 1.7) * 0.5 + Math.cos(time * 1.7 + i * 1.9) * 0.5
				let offset = (noise1 + noise2) * 12 * (1 - Math.abs(t - 0.5) * 2)
				
				let jitterX = baseX + px * offset
				let jitterY = baseY + py * offset
				
				ctx.lineTo(jitterX, jitterY)
			}
			
			ctx.lineTo(ballX, ballY)
			ctx.stroke()
		}
		
		// Draw bright core
		ctx.strokeStyle = "#aaffcc"
		ctx.lineWidth = 1
		ctx.beginPath()
		ctx.moveTo(spriteX, spriteY)
		ctx.lineTo(ballX, ballY)
		ctx.stroke()
		
		// Add small spark effects at both ends
		let sparkCount = 3
		for (let i = 0; i < sparkCount; i++) {
			let sparkAngle = time * 2 + i * (Math.PI * 2 / sparkCount)
			let sparkLen = 8 + Math.sin(time * 3 + i) * 4
			
			ctx.strokeStyle = "rgba(150, 255, 200, 0.8)"
			ctx.lineWidth = 1
			
			// Spark at sprite end
			ctx.beginPath()
			ctx.moveTo(spriteX, spriteY)
			ctx.lineTo(
				spriteX + Math.cos(sparkAngle) * sparkLen,
				spriteY + Math.sin(sparkAngle) * sparkLen
			)
			ctx.stroke()
			
			// Spark at ball end
			ctx.beginPath()
			ctx.moveTo(ballX, ballY)
			ctx.lineTo(
				ballX + Math.cos(sparkAngle + Math.PI) * sparkLen,
				ballY + Math.sin(sparkAngle + Math.PI) * sparkLen
			)
			ctx.stroke()
		}
		
		ctx.restore()
	}
}

// Draw victory drawing strokes and electric line when trophy appears
function drawVictoryDrawing() {
	if (!trophy) return
	
	ctx.save()
	
	// Draw all completed strokes in neon green
	ctx.strokeStyle = "#00ff66"
	ctx.lineWidth = 3
	ctx.lineCap = "round"
	ctx.lineJoin = "round"
	ctx.shadowColor = "#00ff66"
	ctx.shadowBlur = 10
	
	for (let stroke of victoryDrawingStrokes) {
		if (stroke.length < 2) continue
		ctx.beginPath()
		ctx.moveTo(stroke[0].x, stroke[0].y)
		for (let i = 1; i < stroke.length; i++) {
			ctx.lineTo(stroke[i].x, stroke[i].y)
		}
		ctx.stroke()
	}
	
	// Draw current stroke being drawn
	if (currentVictoryStroke && currentVictoryStroke.length >= 2) {
		ctx.beginPath()
		ctx.moveTo(currentVictoryStroke[0].x, currentVictoryStroke[0].y)
		for (let i = 1; i < currentVictoryStroke.length; i++) {
			ctx.lineTo(currentVictoryStroke[i].x, currentVictoryStroke[i].y)
		}
		ctx.stroke()
	}
	
	// Draw electric line from touch position to ball
	if (victoryTouchPos && ball) {
		let touchX = victoryTouchPos.x
		let touchY = victoryTouchPos.y
		let ballX = ball.xPos
		let ballY = ball.yPos
		
		// Calculate distance and direction
		let dx = ballX - touchX
		let dy = ballY - touchY
		let distance = Math.hypot(dx, dy)
		
		if (distance > 1) {
			// Normalize direction
			let nx = dx / distance
			let ny = dy / distance
			// Perpendicular direction for offsets
			let px = -ny
			let py = nx
			
			// Time-based animation for electricity flicker
			let time = Date.now() * 0.01
			
			// Draw glow effect (outer layer)
			ctx.shadowBlur = 0
			ctx.strokeStyle = "rgba(0, 255, 100, 0.3)"
			ctx.lineWidth = 8
			ctx.lineCap = "round"
			ctx.lineJoin = "round"
			ctx.beginPath()
			ctx.moveTo(touchX, touchY)
			ctx.lineTo(ballX, ballY)
			ctx.stroke()
			
			// Draw main electricity line with jagged segments
			let segments = Math.max(5, Math.floor(distance / 30))
			
			// Draw multiple electricity arcs for effect
			for (let arc = 0; arc < 3; arc++) {
				ctx.strokeStyle = arc === 0 ? "#00ff66" : "rgba(150, 255, 200, 0.6)"
				ctx.lineWidth = arc === 0 ? 2 : 1
				
				ctx.beginPath()
				ctx.moveTo(touchX, touchY)
				
				for (let i = 1; i < segments; i++) {
					let t = i / segments
					// Base position along the line
					let baseX = touchX + dx * t
					let baseY = touchY + dy * t
					
					// Add random offset perpendicular to the line (electricity jitter)
					let noise1 = Math.sin(time + i * 3.7 + arc * 2.1) * 0.5 + Math.sin(time * 1.3 + i * 2.3) * 0.5
					let noise2 = Math.cos(time * 0.8 + i * 4.1 + arc * 1.7) * 0.5 + Math.cos(time * 1.7 + i * 1.9) * 0.5
					let offset = (noise1 + noise2) * 12 * (1 - Math.abs(t - 0.5) * 2)
					
					let jitterX = baseX + px * offset
					let jitterY = baseY + py * offset
					
					ctx.lineTo(jitterX, jitterY)
				}
				
				ctx.lineTo(ballX, ballY)
				ctx.stroke()
			}
			
			// Draw bright core
			ctx.strokeStyle = "#aaffcc"
			ctx.lineWidth = 1
			ctx.beginPath()
			ctx.moveTo(touchX, touchY)
			ctx.lineTo(ballX, ballY)
			ctx.stroke()
			
			// Add small spark effects at both ends
			let sparkCount = 3
			for (let i = 0; i < sparkCount; i++) {
				let sparkAngle = time * 2 + i * (Math.PI * 2 / sparkCount)
				let sparkLen = 8 + Math.sin(time * 3 + i) * 4
				
				ctx.strokeStyle = "rgba(150, 255, 200, 0.8)"
				ctx.lineWidth = 1
				
				// Spark at touch end
				ctx.beginPath()
				ctx.moveTo(touchX, touchY)
				ctx.lineTo(
					touchX + Math.cos(sparkAngle) * sparkLen,
					touchY + Math.sin(sparkAngle) * sparkLen
				)
				ctx.stroke()
				
				// Spark at ball end
				ctx.beginPath()
				ctx.moveTo(ballX, ballY)
				ctx.lineTo(
					ballX + Math.cos(sparkAngle + Math.PI) * sparkLen,
					ballY + Math.sin(sparkAngle + Math.PI) * sparkLen
				)
				ctx.stroke()
			}
		}
	}
	
	ctx.restore()
}

// Draw swap hint on level 3 if user hasn't executed a swap yet
function drawLevel3SwapHint() {
	if (level !== 3 || hasExecutedSwap) return
	
	// Generate random position if not set yet
	if (!level3HintPosition) {
		level3HintPosition = getTutorialStep1Position()
	}
	
	if (!level3HintPosition) return
	
	// Calculate fade-in opacity
	let fadeInOpacity = 1.0
	if (level3HintFadeInStartTime !== null && level3HintFadeInStartTime > Date.now()) {
		// Not time to fade in yet
		fadeInOpacity = 0.0
	} else if (level3HintFadeInStartTime !== null) {
		// Fade in
		let elapsed = Date.now() - level3HintFadeInStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	} else {
		// If door hasn't faded out yet, don't show hint
		if (startingDoor) {
			fadeInOpacity = 0.0
		}
	}
	
	// Calculate fade-out opacity
	let fadeOutOpacity = 1.0
	if (level3HintFadeOutStartTime !== null) {
		let elapsed = Date.now() - level3HintFadeOutStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeOutOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
	}
	
	let opacity = fadeInOpacity * fadeOutOpacity
	
	if (opacity <= 0) return // Don't draw if invisible
	
	ctx.save()
	ctx.font = "24px Arial"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.globalAlpha = opacity
	
	let line1 = "hint: swap any two items"
	let line2 = "by tapping them"
	let x = level3HintPosition.x
	let y = level3HintPosition.y
	let lineHeight = 28 // Spacing between lines
	
	// Draw text shadow for readability
	ctx.globalAlpha = opacity * 0.5
	ctx.fillStyle = "black"
	ctx.fillText(line1, x + 1, y - lineHeight / 2 + 1)
	ctx.fillText(line2, x + 1, y + lineHeight / 2 + 1)
	
	// Draw main text in white
	ctx.globalAlpha = opacity
	ctx.fillStyle = "white"
	ctx.fillText(line1, x, y - lineHeight / 2)
	ctx.fillText(line2, x, y + lineHeight / 2)
	
	ctx.restore()
}

// Draw level 2 hint if tries >= 3 and auto-reset has completed (show until last target is hit)
function drawLevel2Hint() {
	if (level !== 2 || tries < 3) return
	
	// Generate random position if not set yet
	if (!level2HintPosition) {
		level2HintPosition = getTutorialStep1Position()
	}
	
	if (!level2HintPosition) return
	
	// Calculate fade-in opacity
	let fadeInOpacity = 1.0
	if (level2HintFadeInStartTime !== null) {
		// Fade in
		let elapsed = Date.now() - level2HintFadeInStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	} else {
		// Not time to fade in yet (waiting for auto-reset to complete)
		fadeInOpacity = 0.0
	}
	
	// Calculate fade-out opacity
	let fadeOutOpacity = 1.0
	if (level2HintFadeOutStartTime !== null) {
		let elapsed = Date.now() - level2HintFadeOutStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeOutOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
	}
	
	let opacity = fadeInOpacity * fadeOutOpacity
	
	if (opacity <= 0) return // Don't draw if invisible
	
	ctx.save()
	ctx.font = "24px Arial"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.globalAlpha = opacity
	
	let line1 = "hint: collect all the trophies"
	let line2 = "in one shot to move on"
	let x = level2HintPosition.x
	let y = level2HintPosition.y
	let lineHeight = 28 // Spacing between lines
	
	// Draw text shadow for readability
	ctx.globalAlpha = opacity * 0.5
	ctx.fillStyle = "black"
	ctx.fillText(line1, x + 1, y - lineHeight / 2 + 1)
	ctx.fillText(line2, x + 1, y + lineHeight / 2 + 1)
	
	// Draw main text in white
	ctx.globalAlpha = opacity
	ctx.fillStyle = "white"
	ctx.fillText(line1, x, y - lineHeight / 2)
	ctx.fillText(line2, x, y + lineHeight / 2)
	
	ctx.restore()
}

// Draw level 1 hint if 10 seconds have passed since ball faded in
function drawLevel1Hint() {
	if (level !== 1 || level1BallFadeInTime === null) return
	
	// Check if 10 seconds have passed since ball faded in
	let timeSinceFadeIn = Date.now() - level1BallFadeInTime
	if (timeSinceFadeIn < 10000) return // Not 10 seconds yet
	
	// Generate random position if not set yet
	if (!level1HintPosition) {
		level1HintPosition = getTutorialStep1Position()
	}
	
	if (!level1HintPosition) return
	
	// Calculate fade-in opacity (fade in over 1 second after the 10 second mark)
	let fadeInOpacity = 1.0
	let timeSinceTrigger = timeSinceFadeIn - 10000
	if (timeSinceTrigger < 0) {
		fadeInOpacity = 0.0
	} else {
		let fadeDuration = FADE_DURATION // 1 second
		fadeInOpacity = Math.min(1.0, timeSinceTrigger / fadeDuration)
	}
	
	// Calculate fade-out opacity
	let fadeOutOpacity = 1.0
	if (level1HintFadeOutStartTime !== null) {
		let elapsed = Date.now() - level1HintFadeOutStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeOutOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
	}
	
	let opacity = fadeInOpacity * fadeOutOpacity
	
	if (opacity <= 0) return // Don't draw if invisible
	
	ctx.save()
	ctx.font = "24px Arial"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.globalAlpha = opacity
	
	let line1 = "hint: fling the smiley face"
	let line2 = "at the trophy"
	let x = level1HintPosition.x
	let y = level1HintPosition.y
	let lineHeight = 28 // Spacing between lines
	
	// Draw text shadow for readability
	ctx.globalAlpha = opacity * 0.5
	ctx.fillStyle = "black"
	ctx.fillText(line1, x + 1, y - lineHeight / 2 + 1)
	ctx.fillText(line2, x + 1, y + lineHeight / 2 + 1)
	
	// Draw main text in white
	ctx.globalAlpha = opacity
	ctx.fillStyle = "white"
	ctx.fillText(line1, x, y - lineHeight / 2)
	ctx.fillText(line2, x, y + lineHeight / 2)
	
	ctx.restore()
}

// Draw level 10 hint
function drawLevel10Hint() {
	if (level !== 10) return
	
	// Generate random position if not set yet
	if (!level10HintPosition) {
		level10HintPosition = getTutorialStep1Position()
	}
	
	if (!level10HintPosition) return
	
	// Calculate fade-in opacity (fade in 1 second after door fades out, like level 3)
	let fadeInOpacity = 1.0
	if (level10HintFadeInStartTime !== null && level10HintFadeInStartTime > Date.now()) {
		// Not time to fade in yet
		fadeInOpacity = 0.0
	} else if (level10HintFadeInStartTime !== null) {
		// Fade in
		let elapsed = Date.now() - level10HintFadeInStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeInOpacity = Math.min(1.0, elapsed / fadeDuration)
	} else {
		// If door hasn't faded out yet, don't show hint
		if (startingDoor) {
			fadeInOpacity = 0.0
		}
	}
	
	// Calculate fade-out opacity
	let fadeOutOpacity = 1.0
	if (level10HintFadeOutStartTime !== null) {
		let elapsed = Date.now() - level10HintFadeOutStartTime
		let fadeDuration = FADE_DURATION // 1 second
		fadeOutOpacity = Math.max(0.0, 1.0 - (elapsed / fadeDuration))
	}
	
	let opacity = fadeInOpacity * fadeOutOpacity
	
	if (opacity <= 0) return // Don't draw if invisible
	
	ctx.save()
	ctx.font = "24px Arial"
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.globalAlpha = opacity
	
	let line1 = "hint: skip any level"
	let line2 = "by tapping the score"
	let x = level10HintPosition.x
	let y = level10HintPosition.y
	let lineHeight = 28 // Spacing between lines
	
	// Draw text shadow for readability
	ctx.globalAlpha = opacity * 0.5
	ctx.fillStyle = "black"
	ctx.fillText(line1, x + 1, y - lineHeight / 2 + 1)
	ctx.fillText(line2, x + 1, y + lineHeight / 2 + 1)
	
	// Draw main text in white
	ctx.globalAlpha = opacity
	ctx.fillStyle = "white"
	ctx.fillText(line1, x, y - lineHeight / 2)
	ctx.fillText(line2, x, y + lineHeight / 2)
	
	ctx.restore()
}

// Get a random position for the hint that avoids sprites and edges
function getTutorialStep1Position() {
	// Calculate the same way tutorial step 1 does, but 1 ball radius higher
	let padding = 40
	let textShadowBuffer = 20
	let measuredWidth = 300 // Approximate text width
	let measuredHeight = 30 // Approximate text height
	let textWidth = measuredWidth + textShadowBuffer * 2
	let textHeight = measuredHeight + textShadowBuffer * 2
	let textHalfWidth = textWidth / 2
	let textHalfHeight = textHeight / 2
	
	// Base centered position
	let xPos = canvas.width / 2
	let yPos = canvas.height * 0.5
	
	// Position the text above the ball (1 ball radius higher than tutorial step 1)
	let ballRadius = getBallRadius()
	let paddingY = padding
	let topExclusionY = canvas.height * 0.2
	// Place the text four ball-radii (2 diameters) above the ball (1 radius higher than tutorial step 1).
	let baseY = (ball?.yPos ?? (canvas.height - paddingY - textHalfHeight)) - (4 * ballRadius)
	// Clamp inside safe region.
	yPos = Math.max(
		topExclusionY + textHalfHeight + paddingY,
		Math.min(baseY, canvas.height - paddingY - textHalfHeight)
	)
	
	return { x: xPos, y: yPos }
}

function getRandomHintPosition() {
	let padding = 80 // Distance from edges
	let spriteBuffer = 120 // Distance from sprites (increased for more spacing)
	
	// Measure text width to avoid placing it where it would go off screen
	// Use the wider of all possible hint texts (level 1, 2, 3, or 10)
	ctx.save()
	ctx.font = "24px Arial"
	let level3Line1Width = ctx.measureText("hint: swap any two items").width
	let level3Line2Width = ctx.measureText("by tapping them").width
	let level2Line1Width = ctx.measureText("hint: collect all the trophies").width
	let level2Line2Width = ctx.measureText("in one shot to move on").width
	let level1Line1Width = ctx.measureText("hint: fling the smiley face").width
	let level1Line2Width = ctx.measureText("at the trophy").width
	let level10Line1Width = ctx.measureText("hint: skip any level").width
	let level10Line2Width = ctx.measureText("by tapping the score").width
	let maxLevel3Width = Math.max(level3Line1Width, level3Line2Width)
	let maxLevel2Width = Math.max(level2Line1Width, level2Line2Width)
	let maxLevel1Width = Math.max(level1Line1Width, level1Line2Width)
	let maxLevel10Width = Math.max(level10Line1Width, level10Line2Width)
	let textWidth = Math.max(maxLevel3Width, maxLevel2Width, maxLevel1Width, maxLevel10Width) // Use the widest line
	ctx.restore()
	
	let minX = padding + textWidth / 2
	let maxX = canvas.width - padding - textWidth / 2
	let minY = padding
	let maxY = canvas.height - padding
	
	// Try to find a valid position (max 50 attempts)
	for (let attempt = 0; attempt < 50; attempt++) {
		let x = minX + Math.random() * (maxX - minX)
		let y = minY + Math.random() * (maxY - minY)
		
		// Check distance from all sprites
		let tooClose = false
		
		// Check ball
		if (ball) {
			let dist = Math.hypot(x - ball.xPos, y - ball.yPos)
			if (dist < spriteBuffer + getBallRadius()) tooClose = true
		}
		
		// Check targets
		for (let target of targetsRemaining) {
			let dist = Math.hypot(x - target.xPos, y - target.yPos)
			if (dist < spriteBuffer + getTargetRadius()) tooClose = true
		}
		
		// Check obstacles
		for (let obstacle of obstacles) {
			let dist = Math.hypot(x - obstacle.xPos, y - obstacle.yPos)
			if (dist < spriteBuffer + obstacle.radius) tooClose = true
		}
		
		// Check special items
		if (star) {
			let dist = Math.hypot(x - star.xPos, y - star.yPos)
			if (dist < spriteBuffer + star.radius) tooClose = true
		}
		if (switcher) {
			let dist = Math.hypot(x - switcher.xPos, y - switcher.yPos)
			if (dist < spriteBuffer + switcher.radius) tooClose = true
		}
		if (cross) {
			let dist = Math.hypot(x - cross.xPos, y - cross.yPos)
			if (dist < spriteBuffer + cross.radius) tooClose = true
		}
		if (lightning) {
			let dist = Math.hypot(x - lightning.xPos, y - lightning.yPos)
			if (dist < spriteBuffer + lightning.radius) tooClose = true
		}
		if (bush) {
			let dist = Math.hypot(x - bush.xPos, y - bush.yPos)
			if (dist < spriteBuffer + bush.radius) tooClose = true
		}
		if (wormhole) {
			for (let wh of wormhole) {
				if (wh) {
					let dist = Math.hypot(x - wh.xPos, y - wh.yPos)
					if (dist < spriteBuffer + wh.radius) tooClose = true
				}
			}
		}
		if (trophy) {
			let dist = Math.hypot(x - trophy.xPos, y - trophy.yPos)
			if (dist < spriteBuffer + trophy.radius) tooClose = true
		}
		
		if (!tooClose) {
			return { x, y }
		}
	}
	
	// Fallback: return center of screen
	return { x: canvas.width / 2, y: canvas.height / 2 }
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
	// - Level 1: steps 1–3 (fling, hit, swap).
	// - Level 2: steps 3–4 (start at swap, then show the final hint).
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
			text = "Hit all the blue balls in one shot"
		} else if (tutorialStep === 3) {
			text = "Swap any two items by tapping them"
		}
	} else if (level === 2) {
		if (tutorialStep === 3) {
			text = "Swap any two items by tapping them"
		} else if (tutorialStep === 4) {
			text = "Think carefully, aim true, and achieve victory!"
		}
	}

	// Set text and measure once for centered placement on screen.
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
	
	// Base centered position
	let xPos = canvas.width / 2
	let yPos = canvas.height * 0.5
	
	// For step 1, position the text above the ball and remember that position.
	if (tutorialStep === 1) {
		let ballRadius = getBallRadius()
		let paddingY = padding
		let topExclusionY = canvas.height * 0.2
		// Place the text three ball-radii (1.5 diameters) above the ball.
		let baseY = (ball?.yPos ?? (canvas.height - paddingY - textHalfHeight)) - (3 * ballRadius)
		// Clamp inside safe region.
		yPos = Math.max(
			topExclusionY + textHalfHeight + paddingY,
			Math.min(baseY, canvas.height - paddingY - textHalfHeight)
		)
	}
	
	// For step 3, reuse the exact position recorded from step 1 (if available),
	// so it visually matches the step 1 location on all levels.
	if (tutorialStep === 3 && tutorialLastX !== null && tutorialLastY !== null) {
		xPos = tutorialLastX
		yPos = tutorialLastY
	}
	
	// For level 1, when we're on step 1, remember the absolute position we used.
	if (level === 1 && tutorialStep === 1) {
		tutorialLastX = xPos
		tutorialLastY = yPos
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