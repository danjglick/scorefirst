// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
const SHIM = visualViewport.width / 10
const GREY_COLOR = "grey"
const BLUE_COLOR = "blue"
const RED_COLOR = "red"
const BALL_RADIUS = visualViewport.width / 20
const FRICTION = .99
const MIN_SPEED = 10
const FLING_DIVISOR = 2
const ATHLETE_RADIUS = visualViewport.width / 20
const GOAL_WIDTH = visualViewport.width / 10
const GOAL_HEIGHT = visualViewport.height / 30
const WALL_WIDTH = visualViewport.width / 10

let canvas;
let context;
let ball = {
	xPos: 0,
	yPos: 0,
	xVel: 0,
	yVel: 0
}
let blueTeam = []
let redTeam = []
let redGoal = {
	xPos: 0,
	yPos: 0
}
let blueGoal = {
	xPos: 0,
	yPos: 0
}
let walls = []
let touch1 = {
	xPos: 0,
	yPos: 0
}
let isUserFlingingBall = false

function initializeGame() {
	canvas = document.getElementById("canvas")
	canvas.width = visualViewport.width
	canvas.height = visualViewport.height
	context = canvas.getContext('2d')
	document.addEventListener("touchstart", handleTouchstart)
	document.addEventListener("touchmove", handleTouchmove, { passive: false })
	startGame()
}

function handleTouchstart(e) {
	touch1.xPos = e.touches[0].clientX
	touch1.yPos = e.touches[0].clientY
	if (isObjectCloseToObject(touch1, SHIM, ball)) {
		isUserFlingingBall = true
	} else {
		blueTeam.push(
			{
				xPos: touch1.xPos,
				yPos: touch1.yPos
			}
		)
	}
}

function handleTouchmove(e) {
	e.preventDefault()
	let touch2 = {
		xPos: e.touches[0].clientX,
		yPos: e.touches[0].clientY
	}
	if (isUserFlingingBall == true) {
		ball.xVel = (touch2.xPos - touch1.xPos) / FLING_DIVISOR
		ball.yVel = (touch2.yPos - touch1.yPos) / FLING_DIVISOR
	}
}

function startGame() {
	placeBall()
	placeRedTeam()
	placeGoals()
	placeWalls()
	loopGame()
}

function placeBall() {
	ball.xPos = randomX()
	ball.yPos = canvas.height - SHIM
}

function placeRedTeam() {
	for (let i=0; i<5; i++) {
		redTeam.push(
			{
				xPos: randomX(),
				yPos: randomY()
			}
		)
	}
}


function placeGoals() {
	let goalXPos = randomX()
	redGoal.xPos = goalXPos
	redGoal.yPos = canvas.height - SHIM
	blueGoal.xPos = goalXPos
	blueGoal.yPos = 0
}

function placeWalls() {
	for (let i=0; i<5; i++) {
		let angle = randomAngle()
		let xPosOfPointA = randomX()
		let yPosOfPointA = randomY()
		walls.push(
			{
				xPosOfPointA: xPosOfPointA,
				yPosOfPointA: yPosOfPointA,
				xPosOfPointB: xPosOfPointA + WALL_WIDTH * Math.cos(angle),
				yPosOfPointB: yPosOfPointA + WALL_WIDTH * Math.sin(angle)
			}
		)
	}
}

function loopGame() { // MAIN GAME LOOP
	moveBall()
	handleCollisions()
	draw()
	setTimeout(loopGame, MS_PER_FRAME)
}

function moveBall() {
	ball.xPos += ball.xVel
	ball.yPos += ball.yVel
	ball.xVel *= FRICTION
	ball.yVel *= FRICTION
	if (Math.abs(ball.yVel) < MIN_SPEED && Math.abs(ball.xVel) < MIN_SPEED) {
		ball.xVel = 0
		ball.yVel = 0
	}
}

function handleCollisions() {
	if (ball.yPos <=0 || ball.yPos >= canvas.height) {
		ball.yVel = -ball.yVel
	}
	if (ball.xPos <= 0 || ball.xPos >= canvas.width) {
		ball.xVel = -ball.xVel
	}
}

function draw() {
	context.clearRect(0, 0, canvas.width, canvas.height)
	drawBall()
	drawRedTeam()
	drawBlueTeam()
	drawBlueGoal()
	drawRedGoal()
	drawWalls()
}

function drawBall() {
	context.beginPath()
	context.arc(ball.xPos, ball.yPos, BALL_RADIUS, 0, 2 * Math.PI)
	context.fillStyle = GREY_COLOR
	context.fill()
}

function drawBlueGoal() {
	context.fillStyle = BLUE_COLOR
	context.fillRect(blueGoal.xPos, blueGoal.yPos, GOAL_WIDTH, GOAL_HEIGHT)
}

function drawRedGoal() {
	context.fillStyle = RED_COLOR
	context.fillRect(redGoal.xPos, redGoal.yPos, GOAL_WIDTH, GOAL_HEIGHT)
}

function drawBlueTeam() {
	for (let i=0; i<blueTeam.length; i++) {
		let member = blueTeam[i]
		context.beginPath()
		context.arc(member.xPos, member.yPos, ATHLETE_RADIUS, 0, 2 * Math.PI)
		context.fillStyle = BLUE_COLOR
		context.fill()	
	}
}

function drawRedTeam() {
	for (let i=0; i<redTeam.length; i++) {
		let member = redTeam[i]
		context.beginPath()
		context.arc(member.xPos, member.yPos, ATHLETE_RADIUS, 0, 2 * Math.PI)
		context.fillStyle = RED_COLOR
		context.fill()	
	}
}

function drawWalls() {
	for (let i=0; i<walls.length; i++) {
		let wall = walls[i]
		context.lineWidth = 3
		context.strokeStyle = GREY_COLOR
		context.beginPath()
		context.moveTo(wall.xPosOfPointA, wall.yPosOfPointA)
		context.lineTo(wall.xPosOfPointB, wall.yPosOfPointB)
		context.stroke()
	}
}

function isObjectCloseToObject(objectA, distance, objectB) {
  return (
    Math.abs(objectA.xPos - objectB.xPos) < distance && 
    Math.abs(objectA.yPos - objectB.yPos) < distance
  )
}

function randomX() {
	return visualViewport.width * Math.random()
}

function randomY() {
	return visualViewport.height * Math.random()
}

function randomAngle() {
	return Math.PI * 2 * Math.random()
}