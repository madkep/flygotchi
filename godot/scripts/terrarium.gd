extends Node3D
## Small world with real collision surfaces and a sensed food region.

var fly: CharacterBody3D
var food: Area3D
var bridge: HTTPRequest
var sequence := 0
var last_contact := false
var last_motor := {}
var request_in_flight := false
var retry_after_msec := 0
var requested_action := "idle"
var action_until_msec := 0
var food_amount: float = 1.0
var wind := Vector3(0.0, 0.0, 0.0)
var status_label: Label
var activity_label: Label
var stats_label: Label

func _ready() -> void:
	sequence = int(Time.get_unix_time_from_system() * 1000.0)
	fly = $Mica
	_make_surface("Ground", Vector3(0, -0.15, 0), Vector3(7, 0.2, 5), Color(0.08, 0.22, 0.17))
	_make_surface("Leaf", Vector3(-1.5, 0.65, 0), Vector3(2.0, 0.12, 1.2), Color(0.16, 0.45, 0.25))
	_make_food(Vector3(1.3, 0.55, 0))
	fly.set_food_target(food.global_position)
	_make_ui()
	bridge = HTTPRequest.new()
	add_child(bridge)
	bridge.request_completed.connect(_on_brain_response)
	set_process(true)

func _process(_delta: float) -> void:
	wind = Vector3(sin(Time.get_ticks_msec() * 0.00031) * 0.035, 0, cos(Time.get_ticks_msec() * 0.00023) * 0.02)
	fly.wind = wind
	food.position.y = 0.55 + sin(Time.get_ticks_msec() * 0.002) * 0.035
	var contact: bool = food != null and food.overlaps_body(fly)
	if contact and food_amount > 0.0:
		food_amount = maxf(0.0, food_amount - _delta * 0.018)
	if food_amount <= 0.0:
		food.monitoring = false
	var action: String = requested_action if Time.get_ticks_msec() < action_until_msec else ("food" if contact else "idle")
	if not request_in_flight and Time.get_ticks_msec() >= retry_after_msec and (contact != last_contact or Time.get_ticks_msec() % 250 < 17 or action != "idle"):
		last_contact = contact
		sequence += 1
		var distance: float = fly.global_position.distance_to(food.global_position) if food else 99.0
		var smell: float = clampf(1.0 - distance / 4.0, 0.0, 1.0)
		var left_vision: float = clampf(0.5 + (food.global_position.x - fly.global_position.x) * 0.35, 0.0, 1.0) if food else 0.0
		var right_vision: float = clampf(1.0 - left_vision, 0.0, 1.0)
		var payload: String = JSON.stringify({"action": action, "food_contact": contact and food_amount > 0.0, "food_smell": smell, "food_smell_left": smell * left_vision, "food_smell_right": smell * right_vision, "vision_left": left_vision, "vision_right": right_vision, "touch": 1.0 if contact else 0.0, "touch_left": 0.5 if contact else 0.0, "touch_right": 0.5 if contact else 0.0, "danger_smell": 0.0, "safety": 0.72, "novelty": 0.10 + wind.length(), "temperature": 0.5 + wind.y, "water_contact": 0.0, "reward": 0.25 if contact else 0.0, "sequence": sequence})
		request_in_flight = true
		var error := bridge.request("http://127.0.0.1:8080/api/v1/senses", PackedStringArray(["Content-Type: application/json"]), HTTPClient.METHOD_POST, payload)
		if error != OK:
			request_in_flight = false
			retry_after_msec = Time.get_ticks_msec() + 1200
		fly.set_food_contact(contact)
		_update_ui(null)

func _on_brain_response(_result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	request_in_flight = false
	if response_code != 200:
		status_label.text = "Cerebro: reconectando…"
		retry_after_msec = Time.get_ticks_msec() + 1200
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if parsed is Dictionary:
		last_motor = parsed.get("motor", {})
		fly.set_motor(last_motor)
		_update_ui(parsed)
	requested_action = "idle"

func _unhandled_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	var keycode: int = event.physical_keycode
	var actions := {KEY_1: "food", KEY_2: "play", KEY_3: "rest", KEY_4: "explore"}
	if actions.has(keycode):
		requested_action = actions[keycode]
		action_until_msec = Time.get_ticks_msec() + 1800
	if keycode == KEY_R:
		food_amount = 1.0
		food.monitoring = true

func _make_ui() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(24, 24)
	panel.size = Vector2(360, 155)
	var box := VBoxContainer.new()
	panel.add_child(box)
	status_label = Label.new()
	status_label.text = "Cerebro: conectando…"
	box.add_child(status_label)
	activity_label = Label.new()
	activity_label.text = "Mica: explorando"
	box.add_child(activity_label)
	stats_label = Label.new()
	stats_label.text = "Necesidades: esperando datos"
	box.add_child(stats_label)
	var help := Label.new()
	help.text = "1 néctar · 2 juego · 3 descanso · 4 explorar · R recargar"
	box.add_child(help)
	$UI.add_child(panel)

func _update_ui(snapshot: Variant) -> void:
	if status_label == null:
		return
	if snapshot is Dictionary:
		status_label.text = "Cerebro: conectado · " + str(snapshot.get("brain_pack", "pack local"))
		var pet: Dictionary = snapshot.get("pet", {})
		activity_label.text = "Mica: " + str(pet.get("activity", "explorando"))
		stats_label.text = "Hambre %d · Energía %d · Néctar %d%%" % [int(pet.get("hunger", 0)), int(pet.get("energy", 0)), int(food_amount * 100.0)]

func _make_surface(label: String, at: Vector3, size: Vector3, color: Color) -> void:
	var body := StaticBody3D.new()
	body.name = label
	body.position = at
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	var mesh := MeshInstance3D.new()
	var cube := BoxMesh.new()
	cube.size = size
	mesh.mesh = cube
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	mesh.material_override = material
	body.add_child(mesh)
	add_child(body)

func _make_food(at: Vector3) -> void:
	food = Area3D.new()
	food.name = "NectarContact"
	food.monitoring = true
	food.position = at
	var shape := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 0.24
	shape.shape = sphere
	food.add_child(shape)
	var mesh := MeshInstance3D.new()
	var fruit := SphereMesh.new()
	fruit.radius = 0.16
	fruit.height = 0.32
	mesh.mesh = fruit
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(1.0, 0.35, 0.18)
	mesh.material_override = material
	food.add_child(mesh)
	add_child(food)
