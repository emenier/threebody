
const n_spheresSlider = document.getElementById('n_spheres');
const G = 1e5
const center_mass = 1e3
const center_radius = 25
const dt = .001
const cam_distance = 650
const dtheta = Math.PI / 3600
const trajmax = 25

let sliders = []
let n_spheres = n_spheresSlider.value
let spheres = []
let animationId = null
let renderer = null
let theta = 0
let trajectories = []
let lines = []
let ti = 0
let scene = null
let camera = null

function drawSphere() {
    init_forms();
    init();
    animate();

}

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}


function compute_acceleration(i,mesh,distances) {
    const dmom_dt = new THREE.Vector3(0,0,0);

    for (let j = 0; j < n_spheres; j++) {
        const mesh2 = spheres[j]
        if (mesh2.id != mesh.id) {
            const diff = mesh.pos.clone().sub(mesh2.position)
            dmom_dt.add(
                diff.clone().multiplyScalar(
                    -1 * G * mesh2.mass / Math.max(50,distances[i][j])**3
                )
            )
        }
    }
    return dmom_dt;
}

function compute_distances() {
    const distances = []
    for (let mesh1 of spheres) {
        const dist_line = []
        for (let mesh2 of spheres) {
            const distance = mesh1.position.distanceTo(mesh2.position);
            dist_line.push(distance);
        }
        distances.push(dist_line);
    }
    return distances;
}

function verlet_step(i,mesh,distances) {
    const acceleration = compute_acceleration(i,mesh,distances)
    const tmp = mesh.pos.clone()
    const new_pos = mesh.pos.clone().add(mesh.pos.clone().sub(mesh.prev_pos).add(acceleration.multiplyScalar(dt**2)))
    mesh.prev_pos = tmp.clone()
    return new_pos;
}

function radius_from_mass(mass_log) {
    return 7 + (25-7)*mass_log/10
}
// Update by replacing geometry
function updateRadius(sphere, newRadius) {
    const segments = sphere.geometry.parameters.widthSegments;
    sphere.geometry.dispose(); // Clean up old geometry
    sphere.geometry = new THREE.SphereGeometry(newRadius, segments, segments);
}

function create_mass_sliders() {

    for (let i=0; i<sliders.length; i++) {
        if (i>=n_spheres) {
            sliders[i].label.remove();
            sliders[i].slider.remove();
            sliders[i].container.remove();
        }
    }
    sliders = sliders.slice(0,n_spheres)

    const sliders_container = document.getElementById('control-container');
    for (let i = sliders.length; i<n_spheres; i++) {
        const slider = document.createElement('input');
        const slider_container = document.createElement('div');
        const slider_label = document.createElement('span');
        slider_label.innerText = `Mass ${i+1} `;
        slider_container.classList.add('mass-slider-container');
        slider_container.appendChild(slider_label);
        slider.type = 'range';
        slider.min = 0;
        slider.max = 10;
        slider.step = 0.1;
        if (i == 0) {
            slider.value = 10
        } else {
            slider.value = getRandomInt(6);
        }
        slider.id = `mass-${i}`;
        slider.classList.add('slider');
        slider.addEventListener('input', (e) => {
            cancelAnimationFrame(animationId);
            const id = e.target.id.split('-')[1];
            const value = parseFloat(e.target.value);
            spheres[id].mass = 2**value;
            updateRadius(spheres[id],radius_from_mass(value))
            console.log(spheres[id].mass);
            for (let sphere of spheres) {
                sphere.prev_pos = sphere.pos.clone()
                sphere.position = sphere.pos.clone()
            }
            animate();
        });
        sliders.push({'container':slider_container,'label':slider_label,'slider':slider});
        slider_container.append(slider);
        sliders_container.append(slider_container);
    }
}

function init_forms() {
    // Number of spheres
    const n_spheresValue = document.getElementById('n_spheres-value');
    n_spheresValue.textContent = n_spheres;

    n_spheresSlider.addEventListener('input', (e) => {
        n_spheres = parseFloat(e.target.value);
        n_spheresValue.textContent = n_spheres.toFixed(1);
        console.log(n_spheres);
        reset_scene();
    });

    console.log(n_spheres,n_spheresValue)
    create_mass_sliders()
    

}

function reset_scene() {
    cancelAnimationFrame(animationId);
    renderer.clear();
    trajectories = [];
    lines = [];
    spheres = [];
    ti = 0
    create_mass_sliders();
    init();
    console.log('Initialised : ',spheres)
    animate();

}

function init() {
    


    // Get the container element
    const container = document.getElementById('scene-container');
        
    // Get container dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;

    // camera 

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(50, width / height, 1, 1000);
    camera.position.z = cam_distance;
    scene.add(camera);

    const segments = 10
    const rings = 10

    for (let i = 0; i < n_spheres; i++) {
        const ix = sliders[i].slider.value
        mass = 2**ix
        if (i!=0) {
            radius = radius_from_mass(ix)
        } else {
            radius = 1
        }

        // sphere object
        const geometry = new THREE.SphereGeometry(radius, segments, rings);
        const material = new THREE.MeshNormalMaterial({
            color: jetColorList[i*Math.floor(jetColorList.length/n_spheres)]//0x002288
        });
        // material = new THREE.MeshBasicMaterial({ 
        //     color: 0xff0000 // Solid red
        // }),
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = (Math.random()-0.5)*cam_distance*0.75;
        mesh.position.y = (Math.random()-0.5)*cam_distance*0.75;
        mesh.position.z = (Math.random()-0.5)*150*0.75;
        if (i == 0) {
            mesh.position.x=0;
            mesh.position.y=0;
            mesh.position.z=0;
        }
        trajectories.push([mesh.position.clone()])

        mesh.speed = new THREE.Vector3(0,0,0);

        mesh.mass = mass
        
        //scene 
        scene.add(mesh);
        spheres.push(mesh);
    }

    const distances = compute_distances()

    for (let i = 0; i < n_spheres; i++) {
        mesh = spheres[i]
        mesh.prev_pos = mesh.position.clone()
        mesh.pos = mesh.position.clone().add(mesh.speed.clone().multiplyScalar(dt))
        const acceleration = compute_acceleration(i,mesh,distances)
        mesh.pos = mesh.pos.clone().add(acceleration.multiplyScalar(0.5*dt**2))
        mesh.position = mesh.pos.clone()

        trajectories[i].push(mesh.position.clone())
        const line_geometry = new THREE.BufferGeometry().setFromPoints(trajectories[i]);
        const line_material = new THREE.LineBasicMaterial({ color: jetColorList[i*Math.floor(jetColorList.length/n_spheres)] });
        const line = new THREE.Line(line_geometry, line_material)
        scene.add(line)
        lines.push(line_geometry);
    }


    // renderer
    if (renderer==null){
        renderer = new THREE.WebGLRenderer();
        renderer.setSize(width, height);
        document.body.appendChild(renderer.domElement);

        // Add renderer to container instead of body
        container.appendChild(renderer.domElement);
    }

}


function animate() {
    animationId = requestAnimationFrame(animate);
    console.log('Animation requested')
    render();

}

function render() {
    ti++


    theta += dtheta

    if (theta > 2*Math.PI) {
        theta = 0;
    }

    camera.position.set(cam_distance * Math.sin(theta),0,cam_distance * Math.cos(theta));
    camera.rotation.y = theta;

    const distances = compute_distances()
    const new_positions = []
    for (let i = 0; i < n_spheres; i++) {

        const mesh = spheres[i]
        new_positions.push(verlet_step(i,mesh,distances))
    }
    for (let i = 0; i < n_spheres; i++) {

        const mesh = spheres[i]
        mesh.pos = new_positions[i].clone()
        mesh.position.x = new_positions[i].x
        mesh.position.y = new_positions[i].y
        mesh.position.z = new_positions[i].z

        if (trajectories[i].length>trajmax){
            trajectories[i] = trajectories[i].slice(trajectories[i].length-trajmax,trajectories[i].length)
        }

        if (ti % 10 == 0) {
            trajectories[i].push(mesh.position.clone())
            const geometry = lines[i]
            geometry.setFromPoints(trajectories[i]);
            geometry.attributes.position.needsUpdate = true;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
        }
    }
    
    renderer.render(scene, camera);


}
const jetColorList = [
    0x000080,
    0x0000bd,
    0x0000fa,
    0x0022ff,
    0x0057ff,
    0x008dff,
    0x00c3ff,
    0x0ff8e8,
    0x3affbc,
    0x66ff91,
    0x91ff66,
    0xbcff3a,
    0xe8ff0f,
    0xffd500,
    0xffa400,
    0xff7200,
    0xff4000,
    0xfa0e00,
    0xbd0000,
    0x800000,
    ];
// fn callin
drawSphere();