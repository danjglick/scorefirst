// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
function getShim() { return (canvas?.width || window.innerWidth) / 10 }
function getBallRadius() { return (canvas?.width || window.innerWidth) / 20 }
function getTeammateRadius() { return (canvas?.width || window.innerWidth) / 20 }
const FRICTION = .99
const FLING_DIVISOR = 2

let canvas;
let ctx;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0,
	isBeingFlung: false
}
let team = []
let teamRemaining = []
let obstacles = []
let wall = []
let walls = []
let isConvertingObstacle = false
let selectedForConversion = null // { type: 'obstacle' | 'teammate', index: number }
let touch1 = {
	xPos: 0,
	yPos: 0
}
let tries = 0
let levelScore = 0
let totalScore = 0
let pointsThisLevel = 0 // Track points gained during current level for retry
let level = 0
let gameLoopTimeout = null
let fireworks = []
let showGoodJob = false
let goodJobMessage = "GOOD JOB"
let goodJobTimeout = null
let obstacleExplosionTimeout = null
let tutorialExplosionTimeout = null

function initializeGame() {
	canvas = document.getElementById("canvas")
	resizeCanvas()
	ctx = canvas.getContext('2d')
	window.addEventListener("resize", resizeCanvas)
	if (visualViewport) {
		visualViewport.addEventListener("resize", resizeCanvas)
	}
	document.addEventListener("touchstart", handleTouchstart)
	document.addEventListener("touchmove", handleTouchmove, { passive: false })
	document.addEventListener("touchend", handleTouchend)
	document.getElementById("retryButton").addEventListener("click", () => {
		// If tries === 0, go to next level with one fewer teammate and obstacle
		if (tries === 0) {
			generateLevel(false, true) // false = not a normal retry, true = fewer sprites
		} else {
			generateLevel(true)
		}
	})
	document.getElementById("nextButton").addEventListener("click", () => generateLevel())
	document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false })
	generateLevel()
}

function generateLevel(isRetry = false, fewerSprites = false) {
	placeBall()
	// If retry (normal retry or retry going to next level), remove points gained during current level
	if (isRetry || (fewerSprites && pointsThisLevel > 0)) {
		totalScore -= pointsThisLevel
	}
	if (!isRetry || fewerSprites) {
		if (!fewerSprites) {
			// Only increment level if not using fewer sprites (normal next button)
			level++
		}
		if (fewerSprites) {
			// Go to next level but with one fewer teammate and obstacle
			// Use current sprite count minus 1, not level-based calculation
			// team.length should still have the previous level's count at this point
			let currentCount = team.length > 0 ? team.length : obstacles.length > 0 ? obstacles.length : level
			let targetCount = Math.max(1, currentCount - 1)
			placeTeamWithCount(targetCount)
			placeObstaclesWithCount(targetCount)
			// Set level to match the sprite count so tutorial shows correctly
			// This effectively "goes back a level" in terms of tutorial display
			level = targetCount
		} else {
			placeTeam()
			placeObstacles()
		}
	} else {
		// Normal retry - restore obstacles and teammates for current level
		// Level stays the same, so tutorial stays the same
		placeTeam()
		placeObstacles()
	}
	teamRemaining = JSON.parse(JSON.stringify(team))
	walls = []
	wall = []
	fireworks = []
	selectedForConversion = null
	showGoodJob = false
	goodJobMessage = "GOOD JOB"
	// Clear any pending timeouts
	if (goodJobTimeout !== null) {
		clearTimeout(goodJobTimeout)
		goodJobTimeout = null
	}
	if (obstacleExplosionTimeout !== null) {
		clearTimeout(obstacleExplosionTimeout)
		obstacleExplosionTimeout = null
	}
	if (tutorialExplosionTimeout !== null) {
		clearTimeout(tutorialExplosionTimeout)
		tutorialExplosionTimeout = null
	}
	levelScore = 0
	pointsThisLevel = 0 // Reset points gained this level
	tries = 0
	updateTutorial()
	if (gameLoopTimeout !== null) {
		clearTimeout(gameLoopTimeout)
		gameLoopTimeout = null
	}
	loopGame()
}

function loopGame() { // MAIN GAME LOOP
	moveBall()
	handleCollision()
	draw()
	gameLoopTimeout = setTimeout(loopGame, MS_PER_FRAME)
}

function handleTouchstart(e) {
	touch1 = {
		xPos: e.touches[0].clientX,
		yPos: e.touches[0].clientY
	}
	isConvertingObstacle = false
	
	if (isObjectCloseToObject(touch1, getShim() * 2, ball)) {
		selectedForConversion = null // Clear selection if touching ball
		ball.isBeingFlung = true
		tries++
		return
	}
	
	let teammateRadius = getTeammateRadius()
	
	// Check if tapping on an obstacle
	for (let i = obstacles.length - 1; i >= 0; i--) {
		let obstacle = obstacles[i]
		let distance = Math.hypot(touch1.xPos - obstacle.xPos, touch1.yPos - obstacle.yPos)
		if (distance < teammateRadius + 20) {
			if (selectedForConversion && selectedForConversion.type === 'teammate') {
				// Second tap: we have a teammate selected, now tapping obstacle - convert both
				let teammateIndex = selectedForConversion.index
				let teammate = teamRemaining[teammateIndex]
				
				// Save positions
				let obstacleX = obstacle.xPos
				let obstacleY = obstacle.yPos
				let teammateX = teammate.xPos
				let teammateY = teammate.yPos
				
				// Remove both from their arrays
				obstacles.splice(i, 1)
				teamRemaining.splice(teammateIndex, 1)
				
				// Convert obstacle to teammate (at obstacle's position)
				teamRemaining.push({
					xPos: obstacleX,
					yPos: obstacleY
				})
				
				// Convert teammate to obstacle (at teammate's position)
				obstacles.push({
					xPos: teammateX,
					yPos: teammateY,
					radius: teammateRadius
				})
				
				selectedForConversion = null
				isConvertingObstacle = true
				return
			} else {
				// First tap: select this obstacle
				selectedForConversion = { type: 'obstacle', index: i }
				return
			}
		}
	}
	
	// Check if tapping on a teammate
	for (let i = teamRemaining.length - 1; i >= 0; i--) {
		let teammate = teamRemaining[i]
		let distance = Math.hypot(touch1.xPos - teammate.xPos, touch1.yPos - teammate.yPos)
		if (distance < teammateRadius + 20) {
			if (selectedForConversion && selectedForConversion.type === 'obstacle') {
				// Second tap: we have an obstacle selected, now tapping teammate - convert both
				let obstacleIndex = selectedForConversion.index
				let obstacle = obstacles[obstacleIndex]
				
				// Save positions
				let obstacleX = obstacle.xPos
				let obstacleY = obstacle.yPos
				let teammateX = teammate.xPos
				let teammateY = teammate.yPos
				
				// Remove both from their arrays
				obstacles.splice(obstacleIndex, 1)
				teamRemaining.splice(i, 1)
				
				// Convert obstacle to teammate (at obstacle's position)
				teamRemaining.push({
					xPos: obstacleX,
					yPos: obstacleY
				})
				
				// Convert teammate to obstacle (at teammate's position)
				obstacles.push({
					xPos: teammateX,
					yPos: teammateY,
					radius: teammateRadius
				})
				
				selectedForConversion = null
				isConvertingObstacle = true
				return
			} else {
				// First tap: select this teammate
				selectedForConversion = { type: 'teammate', index: i }
				return
			}
		}
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
	let teammateRadius = getTeammateRadius()
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
		
		// Check distance from existing teammates using proper Euclidean distance
		for (let i = 0; i < team.length; i++) {
			let teammate = team[i]
			let dx = xPos - teammate.xPos
			let dy = yPos - teammate.yPos
			let distance = Math.hypot(dx, dy)
			let minDistance = radius + teammateRadius + minSeparation
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

function placeTeamWithCount(teammateCount) {
	team = []
	let radius = getTeammateRadius()
	let ballRadius = getBallRadius()
	let minSeparation = 5 // Minimum gap between sprite edges
	let maxAttempts = 100
	// Exclude top area (score and buttons) unless it's a very high level and we need the space
	let topExclusionZone = (level > 10 || teammateCount > 10) ? 0 : 80 // Top 80px exclusion for lower levels
	
	for (let i = 0; i < teammateCount; i++) {
		let attempts = 0
		let xPos, yPos
		let validPosition = false
		
		while (!validPosition && attempts < maxAttempts) {
			// Ensure teammate is fully within canvas bounds
			xPos = radius + (canvas.width - 2 * radius) * Math.random()
			// Exclude top area unless high level
			let minY = radius + topExclusionZone
			let maxY = canvas.height - radius
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
			
			// Check distance from other teammates using proper Euclidean distance
			if (validPosition) {
				for (let j = 0; j < team.length; j++) {
					let dx2 = xPos - team[j].xPos
					let dy2 = yPos - team[j].yPos
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
			let maxY = canvas.height - radius
			yPos = minY + (maxY - minY) * Math.random()
		}
		
		team.push({ 
			xPos: xPos, 
			yPos: yPos 
		})
	}
}

function placeObstaclesWithCount(obstacleCount) {
	obstacles = []
	let obstacleRadius = getTeammateRadius()
	let ballRadius = getBallRadius()
	let teammateRadius = getTeammateRadius()
	let minSeparation = 5 // Minimum gap between sprite edges
	// Exclude top area (score and buttons) unless it's a very high level and we need the space
	let topExclusionZone = (level > 10 || obstacleCount > 10) ? 0 : 80 // Top 80px exclusion for lower levels
	
	for (let i = 0; i < obstacleCount; i++) {
		let attempts = 0
		let xPos, yPos
		let validPosition = false
		
		while (!validPosition && attempts < 100) {
			// Ensure obstacle is fully within canvas bounds
			xPos = obstacleRadius + (canvas.width - 2 * obstacleRadius) * Math.random()
			// Exclude top area unless high level
			let minY = obstacleRadius + topExclusionZone
			let maxY = canvas.height - obstacleRadius
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
			
			// Check distance from teammates using proper Euclidean distance
			if (validPosition) {
				for (let j = 0; j < team.length; j++) {
					let dx2 = xPos - team[j].xPos
					let dy2 = yPos - team[j].yPos
					let distance2 = Math.hypot(dx2, dy2)
					let minDistance2 = obstacleRadius + teammateRadius + minSeparation
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
			let maxY = canvas.height - obstacleRadius
			yPos = minY + (maxY - minY) * Math.random()
		}
		
		obstacles.push({ 
			xPos: xPos, 
			yPos: yPos,
			radius: obstacleRadius
		})
	}
}

function placeObstacleAtPosition(xPos, yPos) {
	let obstacleRadius = getTeammateRadius()
	let minDistance = getShim() * 1.5
	
	// Check if position is valid (not too close to ball, teammates, or other obstacles)
	let validPosition = true
	
	// Check distance from ball
	if (isObjectCloseToObject({xPos, yPos}, minDistance + obstacleRadius, ball)) {
		validPosition = false
	}
	
	// Check distance from teammates
	if (validPosition) {
		for (let j = 0; j < teamRemaining.length; j++) {
			if (isObjectCloseToObject({xPos, yPos}, minDistance + obstacleRadius, teamRemaining[j])) {
				validPosition = false
				break
			}
		}
	}
	
	// Check distance from other obstacles
	if (validPosition) {
		for (let j = 0; j < obstacles.length; j++) {
			if (isObjectCloseToObject({xPos, yPos}, minDistance, obstacles[j])) {
				validPosition = false
				break
			}
		}
	}
	
	// Place obstacle if position is valid
	if (validPosition) {
		obstacles.push({ 
			xPos: xPos, 
			yPos: yPos,
			radius: obstacleRadius
		})
	}
}

function placeTeam() {
	// Progressively increase teammate count: level 1 has 1, increases by 1 per level
	let teammateCount = level
	placeTeamWithCount(teammateCount)
}

function placeObstacles() {
	// Progressively increase obstacle count: level 1 has 1, increases by 1 per level
	let obstacleCount = level
	placeObstaclesWithCount(obstacleCount)
}

function moveBall() {
	ball.xPos += ball.xVel
	ball.yPos += ball.yVel
	ball.xVel *= FRICTION 
	ball.yVel *= FRICTION
}

function handleCollision() {
	handleCollisionWithTeammate()
	handleCollisionWithWall()
	handleCollisionWithObstacle()
	handleCollisionWithEdge()
	handleCollisionWithGoodJob()
}

function handleCollisionWithTeammate() {
	for (let i = 0; i < teamRemaining.length; i++) {
		let teammate = teamRemaining[i]
		let collisionDistance = getBallRadius() + getTeammateRadius()
		let dx = ball.xPos - teammate.xPos
		let dy = ball.yPos - teammate.yPos
		let distance = Math.hypot(dx, dy)
		if (distance < collisionDistance) {
			let rewardPoints = Math.round(100 / Math.max(tries, 1))
			let wasLastTeammate = teamRemaining.length === 1
			let teammateX = teammate.xPos
			let teammateY = teammate.yPos
			teamRemaining.splice(i, 1)
			totalScore += rewardPoints
			pointsThisLevel += rewardPoints
			
			// Create fireworks every time a teammate is collected
			createFireworks(teammateX, teammateY)
			
			// Explode all obstacles in red fireworks when last teammate is collected
			if (wasLastTeammate) {
				// Determine message based on tries vs obstacles
				let obstacleCount = obstacles.length
				if (tries === 1) {
					goodJobMessage = "GOOD JOB"
				} else if (tries < obstacleCount - 1) {
					goodJobMessage = "GOOD JOB"
				} else if (tries >= obstacleCount - 1 && tries <= obstacleCount + 1) {
					goodJobMessage = "OK JOB"
				} else {
					goodJobMessage = "BAD JOB"
				}
				
				// Show message after tutorial text explodes (3 seconds total: 2s for tutorial + 1s delay)
				goodJobTimeout = setTimeout(() => {
					showGoodJob = true
					goodJobTimeout = null
				}, 3000)
				
				// Explode obstacles after 1 second
				obstacleExplosionTimeout = setTimeout(() => {
					for (let j = 0; j < obstacles.length; j++) {
						let obstacle = obstacles[j]
						createFireworks(obstacle.xPos, obstacle.yPos, "red")
					}
					// Remove all obstacles after exploding them
					obstacles = []
					obstacleExplosionTimeout = null
				}, 1000)
				
				// Explode tutorial text after 2 seconds (1s + 1s)
				tutorialExplosionTimeout = setTimeout(() => {
					let tutorialOverlay = document.getElementById("tutorialOverlay")
					if (tutorialOverlay && tutorialOverlay.style.visibility === "visible") {
						// Get the tutorial text position
						let tutorialX = parseFloat(tutorialOverlay.style.left) || canvas.width / 2
						let tutorialY = parseFloat(tutorialOverlay.style.top) || canvas.height / 2
						// Create white fireworks at tutorial position
						createFireworks(tutorialX, tutorialY, "white")
						// Hide and remove tutorial text
						tutorialOverlay.style.display = "none"
						tutorialOverlay.style.visibility = "hidden"
					}
					tutorialExplosionTimeout = null
				}, 2000)
			}
		}
	}
}

function handleCollisionWithWall() {
	walls.forEach(path => {
		for (let i = 1; i < path.length; i++) {
			let point1 = path[i - 1]
			let point2 = path[i]
			
			// Check if ball is close to this line segment
			if (isBallCloseToLineSegment(ball, getShim(), point1, point2)) {
				// Calculate wall vector from point1 to point2
				let wallVectorX = point2.xPos - point1.xPos
				let wallVectorY = point2.yPos - point1.yPos
				
				// Calculate normal vector (perpendicular to wall, pointing away)
				let normalVectorX = -wallVectorY
				let normalVectorY = wallVectorX
				
				// Normalize normal vector
				let length = Math.hypot(normalVectorX, normalVectorY)
				if (length > 0) {
					normalVectorX /= length
					normalVectorY /= length
					
					// Reflect velocity off the wall
					let dot = ball.xVel * normalVectorX + ball.yVel * normalVectorY
					ball.xVel = ball.xVel - 2 * dot * normalVectorX
					ball.yVel = ball.yVel - 2 * dot * normalVectorY
				}
			}
		}
	})
}

function isBallCloseToLineSegment(ball, radius, point1, point2) {
	// Calculate distance from ball to line segment
	let dx = point2.xPos - point1.xPos
	let dy = point2.yPos - point1.yPos
	let lengthSquared = dx * dx + dy * dy
	
	if (lengthSquared === 0) {
		// Points are the same, just check distance to point
		return isObjectCloseToObject(ball, radius, point1)
	}
	
	// Calculate projection parameter
	let t = Math.max(0, Math.min(1, 
		((ball.xPos - point1.xPos) * dx + (ball.yPos - point1.yPos) * dy) / lengthSquared
	))
	
	// Find closest point on line segment
	let closestX = point1.xPos + t * dx
	let closestY = point1.yPos + t * dy
	
	// Check distance from ball to closest point
	let distX = ball.xPos - closestX
	let distY = ball.yPos - closestY
	let distance = Math.hypot(distX, distY)
	
	return distance < radius
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

function handleCollisionWithGoodJob() {
	if (!showGoodJob) return
	
	let ballRadius = getBallRadius()
	let textHeight = 64 // Font size
	let textY = canvas.height // Bottom aligned
	
	// Rectangle extends full width at bottom of screen
	let rectLeft = 0
	let rectRight = canvas.width
	let rectTop = textY - textHeight
	let rectBottom = textY
	
	// Check if ball overlaps with rectangle
	let ballLeft = ball.xPos - ballRadius
	let ballRight = ball.xPos + ballRadius
	let ballTop = ball.yPos - ballRadius
	let ballBottom = ball.yPos + ballRadius
	
	if (ballRight > rectLeft && ballLeft < rectRight && ballBottom > rectTop && ballTop < rectBottom) {
		// Find closest point on rectangle to ball
		let closestX = Math.max(rectLeft, Math.min(ball.xPos, rectRight))
		let closestY = Math.max(rectTop, Math.min(ball.yPos, rectBottom))
		
		// Calculate normal vector from closest point to ball center
		let dx = ball.xPos - closestX
		let dy = ball.yPos - closestY
		let distance = Math.hypot(dx, dy)
		
		// Only process if ball is actually touching the rectangle
		if (distance > 0 && distance <= ballRadius) {
			// Normalize direction
			let normalX = dx / distance
			let normalY = dy / distance
			
			// Reflect velocity off the rectangle surface
			let dot = ball.xVel * normalX + ball.yVel * normalY
			ball.xVel = ball.xVel - 2 * dot * normalX
			ball.yVel = ball.yVel - 2 * dot * normalY
			
			// Push ball outside rectangle to prevent sticking
			let pushDistance = ballRadius + 1
			ball.xPos = closestX + normalX * pushDistance
			ball.yPos = closestY + normalY * pushDistance
			
			// Clamp to keep ball in bounds
			ball.xPos = Math.max(ballRadius, Math.min(canvas.width - ballRadius, ball.xPos))
			ball.yPos = Math.max(ballRadius, Math.min(canvas.height - ballRadius, ball.yPos))
		}
	}
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	drawBall()
	drawTeam()
	drawObstacles()
	drawWalls()
	drawFireworks()
	drawScore()
	drawGoodJob()
}

function createFireworks(x, y, color = "blue") {
	// Create liquid explosion effect with particles
	let particleCount = 12
	let particleColor
	if (color === "red") {
		particleColor = "rgba(255, 0, 0, 1.0)"
	} else if (color === "white") {
		particleColor = "rgba(255, 255, 255, 1.0)"
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
			size: 2 + Math.random() * 2 // Smaller particles
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
}

function drawTeam() {
	for (let i=0; i<teamRemaining.length; i++) {
		let teammate = teamRemaining[i]
		let radius = getTeammateRadius()
		let x = teammate.xPos
		let y = teammate.yPos
		
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
	}
}

function drawObstacles() {
	for (let i = 0; i < obstacles.length; i++) {
		let obstacle = obstacles[i]
		let radius = obstacle.radius
		let x = obstacle.xPos
		let y = obstacle.yPos
		
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
	}
}

function drawWalls() {
	ctx.lineWidth = 20
	ctx.strokeStyle = "purple"
	walls.forEach(wallPath => {
		if (wallPath.length < 2) {
			return
		}
		ctx.beginPath()
		ctx.moveTo(wallPath[0].xPos, wallPath[0].yPos)
		wallPath.forEach(wallPoint => {
			ctx.lineTo(wallPoint.xPos, wallPoint.yPos)
		})
		ctx.stroke()
	})
	// Draw the current wall being drawn
	if (wall.length >= 2 && !ball.isBeingFlung) {
		ctx.beginPath()
		ctx.moveTo(wall[0].xPos, wall[0].yPos)
		wall.forEach(wallPoint => {
			ctx.lineTo(wallPoint.xPos, wallPoint.yPos)
		})
		ctx.stroke()
	}
}

function drawScore() {
	ctx.font = "bold 28px Arial"
	let baseText = `Score: ${totalScore}`
	
	// Draw text outline for better visibility
	ctx.strokeStyle = "black"
	ctx.lineWidth = 4
	ctx.lineJoin = "round"
	ctx.miterLimit = 2
	
	// Draw outline
	ctx.strokeText(baseText, 12, 28)
	
	// Draw fill text
	ctx.fillStyle = "yellow"
	ctx.fillText(baseText, 12, 28)
}

function drawGoodJob() {
	if (!showGoodJob) return
	
	// Color halfway between ball grey (#b0b0b0) and white (#ffffff)
	// Average: (#b0b0b0 + #ffffff) / 2 = #d8d8d8
	let textColor = "#d8d8d8"
	
	ctx.font = "bold 64px Arial"
	let text = goodJobMessage
	
	// Center text horizontally, align with bottom of viewport
	let textX = canvas.width / 2
	let textY = canvas.height // Aligned with bottom
	
	// Draw text outline for better visibility
	ctx.strokeStyle = "black"
	ctx.lineWidth = 6
	ctx.lineJoin = "round"
	ctx.miterLimit = 2
	
	// Draw outline
	ctx.strokeText(text, textX, textY)
	
	// Draw fill text
	ctx.fillStyle = textColor
	ctx.textAlign = "center"
	ctx.textBaseline = "bottom"
	ctx.fillText(text, textX, textY)
	
	// Reset text alignment
	ctx.textAlign = "left"
	ctx.textBaseline = "alphabetic"
}

function updateTutorial() {
	let tutorialOverlay = document.getElementById("tutorialOverlay")
	if (!tutorialOverlay || !canvas) return
	
	let padding = 60 // Minimum padding from edges (increased to prevent cutoff)
	let minDistanceFromSprite = 150 // Minimum distance from sprite edge (increased for safety)
	
	let textContent = ""
	
	if (level === 1) {
		textContent = "Fling the grey ball at the blue ball"
	} else if (level === 2) {
		textContent = "Blast all of the blue balls in as few tries as possible"
	} else if (level === 3) {
		textContent = "Switch red and blue balls by tapping them"
	} else if (level === 4) {
		textContent = "Score a lot of points!"
	} else {
		tutorialOverlay.style.display = "none"
		return
	}
	
	// Set text content and make visible for measurement
	tutorialOverlay.textContent = textContent
	tutorialOverlay.style.display = "block"
	tutorialOverlay.style.visibility = "hidden"
	
	// Force a reflow to ensure accurate measurement
	tutorialOverlay.offsetHeight
	
	// Measure actual text dimensions
	// Add extra padding for text-shadow and visual safety margin
	let textShadowBuffer = 20 // Increased buffer for safety (accounts for text-shadow)
	let measuredWidth = tutorialOverlay.offsetWidth || 300
	let measuredHeight = tutorialOverlay.offsetHeight || 30
	// Add extra margin to account for text-shadow and ensure no cutoff
	let textWidth = measuredWidth + textShadowBuffer * 2 + 20
	let textHeight = measuredHeight + textShadowBuffer * 2 + 20
	let textHalfWidth = textWidth / 2
	let textHalfHeight = textHeight / 2
	
	// Collect all sprites to check for overlaps
	let allSprites = []
	
	// Add all sprites
	allSprites.push({ x: ball.xPos, y: ball.yPos, radius: getBallRadius() })
	
	for (let i = 0; i < teamRemaining.length; i++) {
		allSprites.push({ x: teamRemaining[i].xPos, y: teamRemaining[i].yPos, radius: getTeammateRadius() })
	}
	
	for (let i = 0; i < obstacles.length; i++) {
		allSprites.push({ x: obstacles[i].xPos, y: obstacles[i].yPos, radius: getTeammateRadius() })
	}
	
	// Try multiple positions - ensure all positions account for text dimensions
	let centerX = canvas.width / 2
	let centerY = canvas.height / 2
	let topExclusionY = canvas.height * 0.2 // REQUIRED: Never place text in top 20% (score/buttons area)
	
	// Generate candidate positions (prioritize lower positions)
	let positions = [
		{ x: centerX, y: centerY + 200 }, // Well below center
		{ x: centerX, y: centerY + 150 }, // Further below
		{ x: centerX, y: centerY + 100 }, // Below center
		{ x: centerX, y: centerY + 50 },  // Slightly below center
		{ x: centerX, y: centerY },       // Center (least preferred)
		{ x: centerX - 100, y: centerY + 100 }, // Left below
		{ x: centerX + 100, y: centerY + 100 }  // Right below
	]
	
	// Find a valid position - edge, top 20%, and sprite checks are all REQUIRED
	let validPositions = []
	
	for (let pos of positions) {
		// REQUIRED: Check edges with actual dimensions - skip if would be cut off
		if (pos.x - textHalfWidth < padding || 
		    pos.x + textHalfWidth > canvas.width - padding ||
		    pos.y - textHalfHeight < padding ||
		    pos.y + textHalfHeight > canvas.height - padding) {
			continue
		}
		
		// REQUIRED: Never place text in top 20% - skip if text would be in top 20%
		if (pos.y - textHalfHeight < topExclusionY) {
			continue
		}
		
		// REQUIRED: Check sprite overlaps - must not overlap with any sprite
		let hasSpriteOverlap = false
		for (let sprite of allSprites) {
			// Calculate closest point on text rectangle to sprite center
			let closestX = Math.max(pos.x - textHalfWidth, Math.min(sprite.x, pos.x + textHalfWidth))
			let closestY = Math.max(pos.y - textHalfHeight, Math.min(sprite.y, pos.y + textHalfHeight))
			
			// Calculate distance from closest point to sprite center
			let distX = sprite.x - closestX
			let distY = sprite.y - closestY
			let distance = Math.sqrt(distX * distX + distY * distY)
			
			// Check if sprite overlaps with expanded text box (text + radius + padding)
			if (distance < sprite.radius + minDistanceFromSprite) {
				hasSpriteOverlap = true
				break
			}
		}
		
		if (!hasSpriteOverlap) {
			// Position is valid (already verified to be below top 20%)
			validPositions.push({ pos: pos })
		}
	}
	
	// Select first valid position (all are below top 20%)
	let validPosition = null
	if (validPositions.length > 0) {
		validPosition = validPositions[0].pos
	}
	
	// If no valid position found, try to find any empty space (fallback)
	if (!validPosition) {
		// Try searching in a grid pattern for empty space
		let gridSize = 80
		let found = false
		let minGridY = Math.max(padding + textHalfHeight, topExclusionY + textHalfHeight)
		for (let gridY = minGridY; gridY < canvas.height - padding && !found; gridY += gridSize) {
			for (let gridX = padding + textHalfWidth; gridX < canvas.width - padding && !found; gridX += gridSize) {
				let testPos = { x: gridX, y: gridY }
				let testValid = true
				
				// Check all sprites including the target sprite
				let allSpritesIncludingTarget = [
					{ x: ball.xPos, y: ball.yPos, radius: getBallRadius() },
					...teamRemaining.map(t => ({ x: t.xPos, y: t.yPos, radius: getTeammateRadius() })),
					...obstacles.map(o => ({ x: o.xPos, y: o.yPos, radius: getTeammateRadius() }))
				]
				
				for (let sprite of allSpritesIncludingTarget) {
					let textLeft = testPos.x - textHalfWidth
					let textRight = testPos.x + textHalfWidth
					let textTop = testPos.y - textHalfHeight
					let textBottom = testPos.y + textHalfHeight
					
					let closestX = Math.max(textLeft, Math.min(sprite.x, textRight))
					let closestY = Math.max(textTop, Math.min(sprite.y, textBottom))
					let distX = sprite.x - closestX
					let distY = sprite.y - closestY
					let distance = Math.sqrt(distX * distX + distY * distY)
					
					if (distance < sprite.radius + minDistanceFromSprite) {
						testValid = false
						break
					}
				}
				
				if (testValid) {
					validPosition = testPos
					found = true
				}
			}
		}
		
		if (validPosition) {
			xPos = validPosition.x
			yPos = validPosition.y
		} else {
			// Last resort: below top 20%, but still check bounds
			xPos = Math.max(padding + textHalfWidth, Math.min(canvas.width / 2, canvas.width - padding - textHalfWidth))
			yPos = Math.max(topExclusionY + textHalfHeight, Math.min(canvas.height / 2, canvas.height - padding - textHalfHeight))
		}
	} else {
		xPos = validPosition.x
		yPos = validPosition.y
	}
	
	// Final clamp to ensure text is never cut off and never in top 20% - both are REQUIRED
	let finalSafeMinX = padding + textHalfWidth
	let finalSafeMaxX = canvas.width - padding - textHalfWidth
	let finalSafeMinY = Math.max(padding + textHalfHeight, topExclusionY + textHalfHeight) // Never below top 20%
	let finalSafeMaxY = canvas.height - padding - textHalfHeight
	
	xPos = Math.max(finalSafeMinX, Math.min(xPos, finalSafeMaxX))
	yPos = Math.max(finalSafeMinY, Math.min(yPos, finalSafeMaxY))
	
	// Double-check bounds one more time with actual measured dimensions (REQUIRED - never cut off)
	if (xPos - textHalfWidth < padding) {
		xPos = padding + textHalfWidth
	}
	if (xPos + textHalfWidth > canvas.width - padding) {
		xPos = canvas.width - padding - textHalfWidth
	}
	if (yPos - textHalfHeight < padding) {
		yPos = padding + textHalfHeight
	}
	// REQUIRED: Ensure text is never in top 20%
	if (yPos - textHalfHeight < topExclusionY) {
		yPos = topExclusionY + textHalfHeight
	}
	if (yPos + textHalfHeight > canvas.height - padding) {
		yPos = canvas.height - padding - textHalfHeight
	}
	
	// Final REQUIRED check: ensure no sprite overlap with final position - iterate until no overlap
	let maxRepositionAttempts = 10
	for (let attempt = 0; attempt < maxRepositionAttempts; attempt++) {
		let textLeft = xPos - textHalfWidth
		let textRight = xPos + textHalfWidth
		let textTop = yPos - textHalfHeight
		let textBottom = yPos + textHalfHeight
		
		let hasOverlap = false
		let closestSprite = null
		let minDistance = Infinity
		
		for (let sprite of allSprites) {
			let closestX = Math.max(textLeft, Math.min(sprite.x, textRight))
			let closestY = Math.max(textTop, Math.min(sprite.y, textBottom))
			let distX = sprite.x - closestX
			let distY = sprite.y - closestY
			let distance = Math.sqrt(distX * distX + distY * distY)
			let requiredDistance = sprite.radius + minDistanceFromSprite
			
			if (distance < requiredDistance) {
				hasOverlap = true
				if (distance < minDistance) {
					minDistance = distance
					closestSprite = sprite
				}
			}
		}
		
		if (!hasOverlap) {
			break // No overlap found, we're good
		}
		
		// If overlap detected, push position away from closest sprite
		if (closestSprite) {
			let angle = Math.atan2(yPos - closestSprite.y, xPos - closestSprite.x)
			// If angle is undefined (same position), use random angle
			if (isNaN(angle)) {
				angle = Math.random() * Math.PI * 2
			}
			let pushDistance = closestSprite.radius + minDistanceFromSprite + Math.max(textHalfWidth, textHalfHeight) + 20
			xPos = closestSprite.x + Math.cos(angle) * pushDistance
			yPos = closestSprite.y + Math.sin(angle) * pushDistance
			
			// Re-clamp after shift to ensure still within bounds and never in top 20%
			xPos = Math.max(padding + textHalfWidth, Math.min(xPos, canvas.width - padding - textHalfWidth))
			yPos = Math.max(Math.max(padding + textHalfHeight, topExclusionY + textHalfHeight), Math.min(yPos, canvas.height - padding - textHalfHeight))
		} else {
			break // Can't find closest sprite, break to avoid infinite loop
		}
	}
	
	// Final REQUIRED checks: ensure text is never cut off and never in top 20% (after all repositioning)
	// Check and fix edges - account for transform: translate(-50%, -50%) centering
	let minX = padding + textHalfWidth
	let maxX = canvas.width - padding - textHalfWidth
	let minY = Math.max(padding + textHalfHeight, topExclusionY + textHalfHeight)
	let maxY = canvas.height - padding - textHalfHeight
	
	// Clamp position to ensure text is fully visible
	xPos = Math.max(minX, Math.min(xPos, maxX))
	yPos = Math.max(minY, Math.min(yPos, maxY))
	
	// Double-check bounds one more time to be absolutely sure
	if (xPos - textHalfWidth < padding) {
		xPos = padding + textHalfWidth
	}
	if (xPos + textHalfWidth > canvas.width - padding) {
		xPos = canvas.width - padding - textHalfWidth
	}
	if (yPos - textHalfHeight < padding) {
		yPos = padding + textHalfHeight
	}
	// REQUIRED: Ensure text is never in top 20%
	if (yPos - textHalfHeight < topExclusionY) {
		yPos = topExclusionY + textHalfHeight
	}
	if (yPos + textHalfHeight > canvas.height - padding) {
		yPos = canvas.height - padding - textHalfHeight
	}
	
	// Final safety check: if text still won't fit, center it horizontally and place it safely vertically
	if (textWidth > canvas.width - padding * 2) {
		xPos = canvas.width / 2
	}
	if (textHeight > canvas.height - padding * 2 - topExclusionY) {
		yPos = Math.max(topExclusionY + textHalfHeight + padding, canvas.height / 2)
	}
	
	tutorialOverlay.style.left = xPos + "px"
	tutorialOverlay.style.top = yPos + "px"
	tutorialOverlay.style.visibility = "visible"
}

function isObjectCloseToObject(objectA, distance, objectB) {
  return (
    Math.abs(objectA.xPos - objectB.xPos) < distance && 
    Math.abs(objectA.yPos - objectB.yPos) < distance
  )
}

function getRandomX() {
	return (canvas?.width || window.innerWidth) * Math.random()
}

function getRandomY() {
	return (canvas?.height || window.innerHeight) * Math.random()
}

function resizeCanvas() {
	if (canvas) {
		// Use visualViewport dimensions if available (more accurate on mobile)
		// Otherwise fall back to window dimensions
		if (visualViewport) {
			canvas.width = visualViewport.width
			canvas.height = visualViewport.height
		} else {
			canvas.width = window.innerWidth
			canvas.height = window.innerHeight
		}
	}
}