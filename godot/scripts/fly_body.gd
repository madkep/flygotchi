extends CharacterBody3D
## Procedural fly body for the vertical slice. Replace meshes with a licensed
## rig later without changing the brain or terrarium contracts.

@export var bridge_url := "http://127.0.0.1:8080/api/v1/senses"
var motor := {"eat": 0.0, "rest": 0.0, "explore": 0.4, "social": 0.0}
var food_contact := false
var flying := true
var wing_phase := 0.0
var body: MeshInstance3D
var wings: Array[MeshInstance3D] = []
var legs: Array[MeshInstance3D] = []
var food_target := Vector3.ZERO
var has_food_target := false
var wind := Vector3.ZERO

func _ready() -> void:
	var collider := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.16
	capsule.height = 0.34
	collider.shape = capsule
	collider.position.y = 0.15
	add_child(collider)
	body = _mesh(SphereMesh.new(), Vector3(0.18, 0.12, 0.3), Color(0.16, 0.08, 0.07))
	body.position = Vector3(0, 0.15, 0)
	for side in [-1.0, 1.0]:
		var wing := _mesh(BoxMesh.new(), Vector3(0.38, 0.015, 0.13), Color(0.68, 0.85, 0.9, 0.62))
		wing.position = Vector3(side * 0.2, 0.22, 0)
		wings.append(wing)
	for index in 3:
		for side in [-1.0, 1.0]:
			var leg := _mesh(CylinderMesh.new(), Vector3(0.015, 0.28, 0.015), Color(0.08, 0.04, 0.03))
			leg.position = Vector3(side * (0.12 + index * 0.06), 0.03, (index - 1) * 0.1)
			leg.rotation_degrees.z = side * 55
			legs.append(leg)

func set_motor(next_motor: Dictionary) -> void:
	motor = next_motor

func set_food_contact(value: bool) -> void:
	food_contact = value

func set_food_target(value: Vector3) -> void:
	food_target = value
	has_food_target = true

func _physics_process(delta: float) -> void:
	var intent := String(motor.get("dominant_signal", "explore"))
	var seeking_food: bool = has_food_target and not food_contact and motor.get("eat", 0.0) > 0.45
	flying = (intent in ["explore", "socialize"] or seeking_food) and not food_contact and motor.get("rest", 0.0) < 0.72
	if flying:
		var desired: Vector3 = wind
		if seeking_food:
			var to_food: Vector3 = food_target - global_position
			to_food.y = 0.0
			if to_food.length() > 0.05:
				desired += to_food.normalized() * 0.45
			velocity.x = lerp(velocity.x, desired.x, delta * 2.4)
			velocity.z = lerp(velocity.z, desired.z, delta * 2.4)
		velocity.y = sin(Time.get_ticks_msec() * 0.004) * 0.05
		wing_phase += delta * (28.0 + motor.get("explore", 0.0) * 22.0)
		for index in wings.size():
			wings[index].rotation.z = sin(wing_phase) * 0.30 * (1.0 if index == 0 else -1.0)
	else:
		velocity.y = -min(velocity.y + 5.0 * delta, 2.0)
		for wing in wings: wing.rotation.z = lerp(wing.rotation.z, 0.0, delta * 8.0)
		for index in legs.size(): legs[index].rotation.x = sin(Time.get_ticks_msec() * 0.012 + index) * 0.12
	if not seeking_food:
		velocity.x = lerp(velocity.x, (motor.get("explore", 0.0) - 0.35) * 0.35 + wind.x, delta * 2.0)
		velocity.z = lerp(velocity.z, wind.z, delta * 1.2)
	move_and_slide()
	position.x = clamp(position.x, -3.4, 3.4)
	position.z = clamp(position.z, -2.0, 2.0)

func _mesh(mesh: Mesh, scale_value: Vector3, color: Color) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.scale = scale_value
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA if color.a < 1.0 else BaseMaterial3D.TRANSPARENCY_DISABLED
	item.material_override = material
	add_child(item)
	return item
