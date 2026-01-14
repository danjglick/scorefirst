// npx --yes live-server --host=0.0.0.0 --port=8080
// http://10.0.0.145:8080

const FPS = 30
const MS_PER_FRAME = 1000 / FPS
const SHIM = visualViewport.width / 10
const BALL = {
	color: "grey",
	radius: visualViewport.width / 20,
	friction: .99,
	flingDivisor: 2,
	minimumSpeed: 10,
	xPos: randomX(),
	yPos: visualViewport.height - SHIM,
	xVel: 0,
	yVel: 0,
}
const GOALS_XPOS = randomX()
const GOALS = {
	width: visualViewport.width / 10,
	height: visualViewport.width / 10,
	postThickness: 3,
	blue: {
		color: "blue",
		xPos: GOALS_XPOS,
		yPos: visualViewport.height - SHIM
	},
	red: {
		color: "red",
		xPos: GOALS_XPOS,
		yPos: 0,
	}
}
const ATHLETES = {
	radius: visualViewport.width / 20,
	blue: {
		color: "blue",
		roster: []
	},
	red: {
		color: "red",
		roster: []
	}
}
const WALLS = {
	width: visualViewport.width / 10,
	list: []
}

let canvas;
let context;
let touch1 = {
	xPos: 0,
	yPos: 0
}
let ball = BALL
let goals = GOALS
let athletes = ATHLETES
let walls = WALLS
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
		athletes.blue.roster.push(
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
		ball.xVel = (touch2.xPos - touch1.xPos) / ball.flingDivisor
		ball.yVel = (touch2.yPos - touch1.yPos) / ball.flingDivisor
	}
}

function startGame() {
	generateRedTeam()
	generateWalls()
	loopGame()
}

function placeGoals() {
}

function generateRedTeam() {
	for (let i=0; i<5; i++) {
		athletes.red.roster.push(
			{
				xPos: randomX(),
				yPos: randomY()
			}
		)
	}
}

function generateWalls() {
	for (let i=0; i<4; i++) {
		let angle = randomAngle()
		let xPosOfPointA = randomX()
		let yPosOfPointA = randomY()
		walls.list.push(
			{
				xPosOfPointA: xPosOfPointA,
				yPosOfPointA: yPosOfPointA,
				xPosOfPointB: xPosOfPointA + walls.width * Math.cos(angle),
				yPosOfPointB: yPosOfPointA + walls.width * Math.sin(angle)
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
	ball.xVel *= ball.friction
	ball.yVel *= ball.friction
	if (Math.abs(ball.yVel) < ball.minimumSpeed && Math.abs(ball.xVel) < ball.minimumSpeed) {
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
	drawGoal(goals.blue)
	drawGoal(goals.red)
	drawTeam(athletes.blue)
	drawTeam(athletes.red)
	drawWalls()
}

function drawBall() {
	context.beginPath()
	context.arc(ball.xPos, ball.yPos, ball.radius, 0, 2 * Math.PI)
	context.fillStyle = ball.color
	context.fill()
}

function drawGoal(goal) {
	context.fillStyle = goal.color
	context.fillRect(goal.xPos, goal.yPos, goals.width, goals.height)
}

function drawTeam(team) {
	for (let i=0; i<team.roster.length; i++) {
		let member = team.roster[i]
		context.beginPath()
		context.arc(member.xPos, member.yPos, athletes.radius, 0, 2 * Math.PI)
		context.fillStyle = team.color,
		context.fill()
	}
}

function drawWalls() {
	for (let i=0; i<walls.list.length; i++) {
		let wall = walls.list[i]
		context.lineWidth = 3
		context.strokeStyle = "grey"
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