
const n_spheresSlider = document.getElementById('n_spheres');
const G = 1e5 // Gravitational constant
const dt = .001 // Time step
const cam_distance = 650 // View distance
const dtheta = Math.PI / 3600 // Camera passive rotation speed
const trajmax = 25 // Length of the sphere's trails

let sliders = []
let n_spheres = n_spheresSlider.value
let spheres = []
let animationId = null // ID of the running animation
let renderer = null
let theta = 0
let trajectories = [] // Array of the trails coordinates
let lines = [] // Array of the trails geometries
let ti = 0
let scene = null
let camera = null

function drawSphere() {
    // Main function
    init_forms()
    init()
    animate()

}

function getRandomInt(max) {
    return Math.floor(Math.random() * max)
}


function compute_acceleration(i,mesh,distances) {
    // Compute acceleration under gravitational forces
    // for a given sphere (mesh) with index i in the spheres array, and a matrix of relative distances
    const dmom_dt = new THREE.Vector3(0,0,0) // acceleration

    for (let j = 0; j < n_spheres; j++) {
        // For every other sphere
        const mesh2 = spheres[j]
        if (mesh2.id != mesh.id) {
            const diff = mesh.pos.clone().sub(mesh2.position)
            dmom_dt.add(
                diff.clone().multiplyScalar(
                    -1 * G * mesh2.mass / Math.max(50,distances[i][j])**3
                ) // Distance is floored fo stability, this can lead to divergence in certain system configurations
            )// Increment acceleration
        }
    }
    return dmom_dt
}

function compute_distances() {
    // Compute the matrix of relative distances between spheres
    const distances = []
    for (let mesh1 of spheres) {
        const dist_line = []
        for (let mesh2 of spheres) {
            const distance = mesh1.position.distanceTo(mesh2.position)
            dist_line.push(distance)
        }
        distances.push(dist_line)
    }
    return distances
}

function verlet_step(i,mesh,distances) {
    // Perform one verlet integration step for sphere i, using the pre-computed matrix of relative distances
    // A verlet integration scheme is used, as it's well suited for conservative systems
    const acceleration = compute_acceleration(i,mesh,distances)
    const tmp = mesh.pos.clone()
    const new_pos = mesh.pos.clone().add(mesh.pos.clone().sub(mesh.prev_pos).add(acceleration.multiplyScalar(dt**2)))
    mesh.prev_pos = tmp.clone()
    return new_pos
}

function radius_from_mass(mass_log) {
    // Sphere's drawing radii are computed depending on their mass
    return 7 + (25-7)*mass_log/10
}

function updateRadius(sphere, newRadius) {
    // Update the radius of a given sphere geometry
    const segments = sphere.geometry.parameters.widthSegments
    sphere.geometry.dispose() // Clean up old geometry
    sphere.geometry = new THREE.SphereGeometry(newRadius, segments, segments)
}

function create_mass_sliders() {
    // Cretes the sliders to adjust the mass of each sphere depending on the value of n_spheres


    for (let i=0; i<sliders.length; i++) { // Removes unecessary spheres
        if (i>=n_spheres) {
            sliders[i].label.remove()
            sliders[i].slider.remove()
            sliders[i].container.remove()
        }
    }
    sliders = sliders.slice(0,n_spheres)

    const sliders_container = document.getElementById('control-container')
    for (let i = sliders.length; i<n_spheres; i++) {// Creates new sliders if they are necessary
        const slider = document.createElement('input')
        const slider_container = document.createElement('div')
        const slider_label = document.createElement('span')
        slider_label.innerText = `Mass ${i+1} `
        slider_container.classList.add('mass-slider-container')
        slider_container.appendChild(slider_label)
        slider.type = 'range'
        slider.min = 0
        slider.max = 10
        slider.step = 0.1
        if (i == 0) {
            slider.value = 10 // First sphere is as heavy as possible to anchor the system
        } else {
            slider.value = getRandomInt(6) // Other spheres are randomly heavy, although at most 0.6 times the first sphere's mass
        }
        slider.id = `mass-${i}`
        slider.classList.add('slider')
        slider.addEventListener('input', (e) => {// When mass is changed
            cancelAnimationFrame(animationId)
            const id = e.target.id.split('-')[1]
            const value = parseFloat(e.target.value)
            spheres[id].mass = 2**value // Updating mass with new value
            updateRadius(spheres[id],radius_from_mass(value)) // Updating radius with new value
            console.log(spheres[id].mass)
            for (let sphere of spheres) {
                sphere.prev_pos = sphere.pos.clone()
                sphere.position = sphere.pos.clone()
            } // Removing momentum to avoid a small sphere with a very high momentum. Doesn't work very well
            animate()
        })
        sliders.push({'container':slider_container,'label':slider_label,'slider':slider})
        slider_container.append(slider)
        sliders_container.append(slider_container)
    }
}

function init_forms() {
    // Initializes the n_spheres slider and grabs its value
    const n_spheresValue = document.getElementById('n_spheres-value')
    n_spheresValue.textContent = n_spheres

    n_spheresSlider.addEventListener('input', (e) => {// Handles updates on the number of spheres
        n_spheres = parseFloat(e.target.value)
        n_spheresValue.textContent = n_spheres.toFixed(0)
        console.log(n_spheres)
        reset_scene() // Regenerates the scene
    })

    console.log(n_spheres,n_spheresValue)
    create_mass_sliders() // Creates sliders to adjust masses
    

}

function reset_scene() {
    // Regenerates an animation scene
    cancelAnimationFrame(animationId) // cancels running animation
    renderer.clear()
    trajectories = []
    lines = []
    spheres = []
    ti = 0
    create_mass_sliders()
    init()
    console.log('Initialised : ',spheres)
    animate()

}

function init() {
    
    // Initialise the simulation scene

    // Get the container element
    const container = document.getElementById('scene-container')
        
    // Get container dimensions
    const width = container.clientWidth
    const height = container.clientHeight

    // camera 

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000)
    camera.position.z = cam_distance
    scene.add(camera)

    const segments = 10
    const rings = 10

    for (let i = 0; i < n_spheres; i++) {
        const ix = sliders[i].slider.value // Mass log value
        mass = 2**ix
        if (i!=0) { // The first sphere is the anchor and has a small radius (it's a black hole)
            radius = radius_from_mass(ix) 
        } else {
            radius = 1
        }

        // sphere object
        const geometry = new THREE.SphereGeometry(radius, segments, rings)
        const material = new THREE.MeshNormalMaterial({
            color: jetColorList[i*Math.floor(jetColorList.length/n_spheres)]//
        })
        // material = new THREE.MeshBasicMaterial({ 
        //     color: 0xff0000 // Solid red
        // }),
        const mesh = new THREE.Mesh(geometry, material)
        // Generating a random position
        mesh.position.x = (Math.random()-0.5)*cam_distance*0.75
        mesh.position.y = (Math.random()-0.5)*cam_distance*0.75
        mesh.position.z = (Math.random()-0.5)*150*0.75
        if (i == 0) { // The first sphere is at the center
            mesh.position.x=0
            mesh.position.y=0
            mesh.position.z=0
        }
        trajectories.push([mesh.position.clone()]) // Storing current position

        mesh.speed = new THREE.Vector3(0,0,0) // For now, init speed is none to avoid having a non-zero average speed

        mesh.mass = mass
        
        //scene 
        scene.add(mesh)
        spheres.push(mesh)
    }

    const distances = compute_distances()

    for (let i = 0; i < n_spheres; i++) {
        // First verlet step
        mesh = spheres[i]
        mesh.prev_pos = mesh.position.clone() // Storing previous position for later integration
        mesh.pos = mesh.position.clone().add(mesh.speed.clone().multiplyScalar(dt))
        const acceleration = compute_acceleration(i,mesh,distances)
        mesh.pos = mesh.pos.clone().add(acceleration.multiplyScalar(0.5*dt**2))
        mesh.position = mesh.pos.clone()

        // Creating the trails
        trajectories[i].push(mesh.position.clone())
        const line_geometry = new THREE.BufferGeometry().setFromPoints(trajectories[i])
        const line_material = new THREE.LineBasicMaterial({ color: jetColorList[i*Math.floor(jetColorList.length/n_spheres)] })
        const line = new THREE.Line(line_geometry, line_material)
        scene.add(line)
        lines.push(line_geometry)
    }


    // renderer
    if (renderer==null){ // Initialising the renderer
        renderer = new THREE.WebGLRenderer()
        renderer.setSize(width, height)
        document.body.appendChild(renderer.domElement)

        // Add renderer to container instead of body
        container.appendChild(renderer.domElement)
    }

}


function animate() {
    animationId = requestAnimationFrame(animate) // ID is stored to stop and re-launch animation
    console.log('Animation requested')
    render()
}

function render() {
    // Performs the system time-stepping, updates positions, trails, rotates the cam etc ...
    ti++


    theta += dtheta // Camera angle

    if (theta > 2*Math.PI) {
        theta = 0
    }
    // Tigonometry
    camera.position.set(cam_distance * Math.sin(theta),0,cam_distance * Math.cos(theta))
    camera.rotation.y = theta

    // Sphere dynamics integration
    const distances = compute_distances()
    const new_positions = []
    for (let i = 0; i < n_spheres; i++) {

        const mesh = spheres[i]
        new_positions.push(verlet_step(i,mesh,distances))
    }

    for (let i = 0; i < n_spheres; i++) { // Sphere's positions update

        const mesh = spheres[i]
        mesh.pos = new_positions[i].clone()
        mesh.position.x = new_positions[i].x
        mesh.position.y = new_positions[i].y
        mesh.position.z = new_positions[i].z

        if (trajectories[i].length>trajmax){ // Truncating trajectories
            trajectories[i] = trajectories[i].slice(trajectories[i].length-trajmax,trajectories[i].length)
        }

        if (ti % 10 == 0) { // Storing positions every ten time steps
            trajectories[i].push(mesh.position.clone())
            const geometry = lines[i]
            geometry.setFromPoints(trajectories[i])
            geometry.attributes.position.needsUpdate = true
            geometry.computeBoundingBox()
            geometry.computeBoundingSphere()
        }
    }
    
    renderer.render(scene, camera)


}
const jetColorList = [0x000080, 0x000084, 0x000089, 0x00008d, 0x000096, 0x00009b, 0x00009f, 0x0000a8, 0x0000ad, 0x0000b2, 0x0000b6, 0x0000bf, 0x0000c4, 0x0000c8, 0x0000d1, 0x0000d6, 0x0000da, 0x0000df, 0x0000e8, 0x0000ed, 0x0000f1, 0x0000fa, 0x0000ff, 0x0000ff, 0x0000ff, 0x0000ff, 0x0004ff, 0x0008ff, 0x0010ff, 0x0014ff, 0x0018ff, 0x001cff, 0x0024ff, 0x0028ff, 0x002cff, 0x0034ff, 0x0038ff, 0x003cff, 0x0040ff, 0x0048ff, 0x004cff, 0x0050ff, 0x0058ff, 0x005cff, 0x0060ff, 0x0064ff, 0x006cff, 0x0070ff, 0x0074ff, 0x007cff, 0x0080ff, 0x0084ff, 0x0088ff, 0x0090ff, 0x0094ff, 0x0098ff, 0x00a0ff, 0x00a4ff, 0x00a8ff, 0x00acff, 0x00b4ff, 0x00b8ff, 0x00bcff, 0x00c4ff, 0x00c8ff, 0x00ccff, 0x00d0ff, 0x00d8ff, 0x00dcfe, 0x00e0fb, 0x02e8f4, 0x06ecf1, 0x09f0ee, 0x0cf4eb, 0x13fce4, 0x16ffe1, 0x19ffde, 0x1fffd7, 0x23ffd4, 0x26ffd1, 0x29ffce, 0x30ffc7, 0x33ffc4, 0x36ffc1, 0x3cffba, 0x40ffb7, 0x43ffb4, 0x46ffb1, 0x4dffaa, 0x50ffa7, 0x53ffa4, 0x5aff9d, 0x5dff9a, 0x60ff97, 0x63ff94, 0x6aff8d, 0x6dff8a, 0x70ff87, 0x77ff80, 0x7aff7d, 0x7dff7a, 0x80ff77, 0x87ff70, 0x8aff6d, 0x8dff6a, 0x94ff63, 0x97ff60, 0x9aff5d, 0x9dff5a, 0xa4ff53, 0xa7ff50, 0xaaff4d, 0xb1ff46, 0xb4ff43, 0xb7ff40, 0xbaff3c, 0xc1ff36, 0xc4ff33, 0xc7ff30, 0xceff29, 0xd1ff26, 0xd4ff23, 0xd7ff1f, 0xdeff19, 0xe1ff16, 0xe4ff13, 0xebff0c, 0xeeff09, 0xf1fc06, 0xf4f802, 0xfbf100, 0xfeed00, 0xffea00, 0xffe200, 0xffde00, 0xffdb00, 0xffd700, 0xffd000, 0xffcc00, 0xffc800, 0xffc100, 0xffbd00, 0xffb900, 0xffb600, 0xffae00, 0xffab00, 0xffa700, 0xff9f00, 0xff9c00, 0xff9800, 0xff9400, 0xff8d00, 0xff8900, 0xff8600, 0xff7e00, 0xff7a00, 0xff7700, 0xff7300, 0xff6c00, 0xff6800, 0xff6400, 0xff5d00, 0xff5900, 0xff5500, 0xff5200, 0xff4a00, 0xff4700, 0xff4300, 0xff3b00, 0xff3800, 0xff3400, 0xff3000, 0xff2900, 0xff2500, 0xff2200, 0xff1a00, 0xff1600, 0xff1300, 0xfa0f00, 0xf10800, 0xed0400, 0xe80000, 0xdf0000, 0xda0000, 0xd60000, 0xd10000, 0xc80000, 0xc40000, 0xbf0000, 0xb60000, 0xb20000, 0xad0000, 0xa80000, 0x9f0000, 0x9b0000, 0x960000, 0x8d0000, 0x890000, 0x840000, 0x800000
    ]
// fn callin
drawSphere()