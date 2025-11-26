// --- FIREBASE IMPORTS ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, signInAnonymously, signInWithCustomToken, 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, doc, setDoc, updateDoc, onSnapshot, 
    collection, query, where, getDocs, deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// setLogLevel('debug'); // Descomente para debug de console no console do navegador

// --- Variáveis Globais de Configuração ---
const NOME_BINGO = "🎉 BINGÃO DA SORTE ONLINE 🍀";
const DEFAULT_MAX = 90;
const GAME_DOC_ID = 'state';

// Variáveis de estado global (atualizadas via onSnapshot)
let estadoGlobal = {
    intervaloMax: DEFAULT_MAX,
    numerosASortear: [],
    bolasSorteadas: [],
    vencedorEncontrado: false,
    vencedorCodigo: '',
    cartelasCadastradas: {}
};

// --- Configuração e Inicialização do Firebase ---
let db;
let auth;
let userId = null;
let isAuthReady = false;

// Variáveis globais do ambiente
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Caminho Firestore: /artifacts/{appId}/public/data/bingo_game/state
const BINGO_DOC_PATH = `artifacts/${appId}/public/data/bingo_game/${GAME_DOC_ID}`;

// ----------------------------------------------------
// --- FIREBASE & AUTHENTICATION SETUP ---
// ----------------------------------------------------

function setupFirebase() {
    if (Object.keys(firebaseConfig).length === 0) {
        console.error("Firebase Configuração não encontrada. Usando modo de simulação.");
        return;
    }

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
            } else {
                await signInAnonymously(auth);
                userId = auth.currentUser?.uid || crypto.randomUUID();
            }
            isAuthReady = true;
            
            // Após autenticação, inicia a escuta do Firestore
            startRealtimeListener();
        });

        if (initialAuthToken) {
            signInWithCustomToken(auth, initialAuthToken).catch(e => {
                console.warn("Erro ao usar token customizado:", e);
                signInAnonymously(auth); // Fallback
            });
        } else {
            signInAnonymously(auth); 
        }

    } catch (error) {
        console.error("Erro ao inicializar Firebase:", error);
    }
}

// ----------------------------------------------------
// --- REAL-TIME DATA HANDLING (onSnapshot) ---
// ----------------------------------------------------

function startRealtimeListener() {
    if (!isAuthReady || !db) return;

    const gameDocRef = doc(db, BINGO_DOC_PATH);

    onSnapshot(gameDocRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            estadoGlobal = {
                ...estadoGlobal, // Mantém defaults se faltar algo (segurança)
                ...data,
                cartelasCadastradas: data.cartelasCadastradas || {}
            };
            
        } else {
            // Documento não existe: Inicializa o jogo no Firestore
            console.log("Documento do jogo não encontrado. Inicializando...");
            estadoGlobal = criarNovoEstado(DEFAULT_MAX, {});
            salvarEstado(estadoGlobal, true); // Cria o documento
        }
        
        // Renderiza a interface da página atual
        renderizarPaginaAtual();
    }, (error) => {
        console.error("Erro ao receber atualização em tempo real:", error);
        // Exibe um alerta de erro de conexão/permissão
        if (error.code === 'permission-denied') {
            alert("ERRO de Permissão: Verifique as Regras de Segurança do Firestore. O acesso público pode estar bloqueado.");
        }
    });
}

// ----------------------------------------------------
// --- FIREBASE DATA OPERATIONS (Set/Update) ---
// ----------------------------------------------------

function criarNovoEstado(novoMax, cartelas) {
    const max = novoMax || DEFAULT_MAX;
    const numeros = Array.from({ length: max }, (_, i) => i + 1);
    numeros.sort(() => Math.random() - 0.5); 
    
    return {
        intervaloMax: max,
        numerosASortear: numeros,
        bolasSorteadas: [],
        vencedorEncontrado: false,
        vencedorCodigo: '',
        cartelasCadastradas: cartelas || {}
    };
}

/**
 * Salva o estado completo do jogo no Firestore.
 * @param {object} estado - O estado global atualizado.
 * @param {boolean} isNewDoc - Se for um novo documento (setDoc), caso contrário, usa updateDoc.
 */
async function salvarEstado(estado, isNewDoc = false) {
    if (!isAuthReady || !db) {
        console.error("Firestore não está pronto.");
        return;
    }

    const docRef = doc(db, BINGO_DOC_PATH);
    
    try {
        if (isNewDoc) {
            // Cria o documento pela primeira vez
            await setDoc(docRef, estado);
        } else {
            // Atualiza o estado completo em uma única operação
            await updateDoc(docRef, estado);
        }
    } catch (e) {
        console.error("ERRO CRÍTICO ao salvar estado do jogo:", e);
        // Não usamos alert aqui para não interromper loops, o onSnapshot lidará com o erro
    }
}

// ----------------------------------------------------
// --- FUNÇÕES DE CONTROLE DE JOGO ---
// ----------------------------------------------------

async function mudarConfiguracao() {
    const select = document.getElementById('select-bolas');
    const novoMax = parseInt(select.value);

    if (estadoGlobal.bolasSorteadas.length > 0 && 
        !confirm(`Mudar para ${novoMax} bolas irá reiniciar o jogo e apagar as bolas sorteadas. Deseja continuar?`)) {
        return;
    }
    
    // 1. Cria o novo estado mantendo as cartelas
    const novoEstado = criarNovoEstado(novoMax, estadoGlobal.cartelasCadastradas);
    
    // 2. Salva o novo estado no Firestore (incluindo o novo intervaloMax)
    await salvarEstado(novoEstado, false);
    
    alert(`Configuração alterada para Bingo de ${novoMax} bolas. Jogo reiniciado.`);
}

async function sortearBola() {
    let estado = { ...estadoGlobal };
    
    if (!isAuthReady) return; 

    if (estado.vencedorEncontrado) {
        document.getElementById('sorteio-status').innerHTML = '<p class="text-danger mt-3">🛑 O jogo já tem um vencedor.</p>';
        return;
    }

    if (estado.numerosASortear.length === 0) {
        document.getElementById('sorteio-status').innerHTML = '<p class="text-danger mt-3">🛑 Todas as bolas foram sorteadas! Sem vencedor.</p>';
        estado.vencedorEncontrado = true;
        await salvarEstado(estado);
        return;
    }
    
    // 1. Sorteio
    const bolaSorteada = estado.numerosASortear.pop();
    estado.bolasSorteadas.push(bolaSorteada);
    
    // Simula animação de destaque (o onSnapshot atualiza o número)
    const bolaElement = document.getElementById('ultima-bola');
    if (bolaElement) {
        bolaElement.classList.add('bola-animada');
        setTimeout(() => { bolaElement.classList.remove('bola-animada'); }, 500);
    }

    // 2. Detecção de Vencedor
    let vencedor = null;
    for (const codigo in estado.cartelasCadastradas) {
        const numerosCartela = estado.cartelasCadastradas[codigo];
        // Verifica se TODOS os números da cartela estão nas bolas sorteadas
        const isVencedor = numerosCartela.every(n => estado.bolasSorteadas.includes(n));
        
        if (isVencedor) {
            vencedor = codigo;
            break;
        }
    }

    if (vencedor) {
        estado.vencedorEncontrado = true;
        estado.vencedorCodigo = vencedor;
        clearInterval(intervaloAutomatico);
    }

    // 3. Salva o novo estado
    await salvarEstado(estado);
}

let intervaloAutomatico;

function toggleSorteioAutomatico() {
    const btnAuto = document.getElementById('btn-sortear-auto');
    const interval = 1000;
    
    if (intervaloAutomatico) {
        clearInterval(intervaloAutomatico);
        intervaloAutomatico = null;
        btnAuto.textContent = '▶️ Sorteio Automático';
        btnAuto.classList.remove('btn-warning');
        btnAuto.classList.add('btn-primary');
    } else {
        if (estadoGlobal.vencedorEncontrado) return;
        
        intervaloAutomatico = setInterval(() => {
            sortearBola();
            if (estadoGlobal.vencedorEncontrado || estadoGlobal.numerosASortear.length === 0) {
                clearInterval(intervaloAutomatico);
                intervaloAutomatico = null;
                btnAuto.textContent = '▶️ Sorteio Automático';
                btnAuto.classList.remove('btn-warning');
                btnAuto.classList.add('btn-primary');
            }
        }, interval);
        
        btnAuto.textContent = '⏸️ Parar Sorteio Automático';
        btnAuto.classList.remove('btn-primary');
        btnAuto.classList.add('btn-warning');
    }
}

async function cadastrarCartela() {
    let estado = { ...estadoGlobal };
    const codigoInput = document.getElementById('input-codigo').value.trim();
    const numerosInput = document.getElementById('input-numeros').value.trim();
    const mensagemDiv = document.getElementById('cadastro-mensagem');
    const max = estado.intervaloMax;

    mensagemDiv.textContent = ''; 
    
    let codigo = codigoInput;
    if (!codigo) {
        codigo = `PC-${Math.floor(Math.random() * 9999) + 1}`; 
    }

    if (estado.cartelasCadastradas[codigo] && 
        !confirm(`A cartela com código '${codigo}' já existe. Deseja substituí-la?`)) {
        mensagemDiv.textContent = 'Operação cancelada.';
        mensagemDiv.className = 'text-warning mt-2';
        return;
    }

    try {
        const numeros = numerosInput.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));

        if (numeros.length === 0 || numeros.some(n => n < 1 || n > max)) {
            mensagemDiv.textContent = `Números inválidos. Devem ser entre 1 e ${max}, separados por vírgula.`;
            mensagemDiv.className = 'text-danger mt-2';
            return;
        }

        if (new Set(numeros).size !== numeros.length) {
            mensagemDiv.textContent = 'A cartela não pode ter números duplicados.';
            mensagemDiv.className = 'text-danger mt-2';
            return;
        }

        // Atualiza a cópia local do estado e salva
        estado.cartelasCadastradas[codigo] = numeros;
        
        await salvarEstado(estado); 
        
        document.getElementById('input-codigo').value = '';
        document.getElementById('input-numeros').value = '';
        mensagemDiv.textContent = `Cartela '${codigo}' cadastrada/atualizada com sucesso!`;
        mensagemDiv.className = 'text-success mt-2';

    } catch (e) {
        console.error("Erro ao cadastrar cartela:", e);
        mensagemDiv.textContent = 'Erro ao salvar a cartela no banco de dados.';
        mensagemDiv.className = 'text-danger mt-2';
    }
}

async function resetarJogoCompleto(manterCartelas = false) {
    if (!isAuthReady) return;

    let estado = { ...estadoGlobal };
    const cartelasParaManter = manterCartelas ? estado.cartelasCadastradas : {};
    
    const novoEstado = criarNovoEstado(estado.intervaloMax, cartelasParaManter);
    
    await salvarEstado(novoEstado, false);
    
    const msg = manterCartelas ? 'Jogo reiniciado! Cartelas mantidas.' : 'Reset Geral: Jogo e cartelas apagados.';
    alert(msg);
}

// ----------------------------------------------------
// --- FUNÇÕES DE RENDERIZAÇÃO (Compartilhadas) ---
// ----------------------------------------------------

function renderizarPaginaAtual() {
    // 1. Configura o cabeçalho em todas as páginas
    document.getElementById('bingo-title').textContent = NOME_BINGO;
    document.getElementById('footer-text').textContent = "By: An.Yoshi 2025";

    // 2. Chama a função de renderização específica
    if (document.body.id === 'index-page') {
        renderizarIndex(estadoGlobal);
    } else if (document.body.id === 'admin-page') {
        renderizarAdmin(estadoGlobal);
    }
}

// --- RENDERIZAÇÃO INDEX (Sorteio) ---

function renderizarIndex(estado) {
    const ultimaBola = estado.bolasSorteadas.length > 0 ? estado.bolasSorteadas.slice(-1)[0] : '—';
    document.getElementById('ultima-bola').textContent = String(ultimaBola).padStart(2, '0');
    
    renderizarBolasSorteadas(estado.bolasSorteadas);
    
    const statusDiv = document.getElementById('sorteio-status');
    statusDiv.innerHTML = '';
    
    if (estado.vencedorEncontrado) {
        if (estado.vencedorCodigo) {
             exibirVencedor(estado.vencedorCodigo, estado.cartelasCadastradas, estado.bolasSorteadas);
        } else {
             statusDiv.innerHTML = '<p class="text-danger mt-3">🛑 Todas as bolas foram sorteadas! Sem vencedor.</p>';
        }
    }
    
    document.getElementById('btn-sortear').disabled = estado.vencedorEncontrado;
    document.getElementById('btn-sortear-auto').disabled = estado.vencedorEncontrado;
}

function renderizarBolasSorteadas(bolas) {
    const listaBolas = document.getElementById('bolas-sorteadas-lista');
    listaBolas.innerHTML = '';
    
    if (bolas.length === 0) {
        listaBolas.innerHTML = '<p class="text-muted mt-2">Nenhuma bola sorteada ainda.</p>';
        return;
    }

    bolas.forEach(bola => {
        const span = document.createElement('span');
        span.className = 'bola-sorteada-item';
        span.textContent = String(bola).padStart(2, '0');
        listaBolas.appendChild(span);
    });
}

function exibirVencedor(codigoVencedor, cartelas, bolasSorteadas) {
    const numerosVencedor = cartelas[codigoVencedor].map(n => String(n).padStart(2, '0')).sort((a, b) => a - b).join(' - ');

    const statusDiv = document.getElementById('sorteio-status');
    statusDiv.innerHTML = `
        <div class="alert alert-danger text-center mt-3 p-4">
            <h2>🏆 BINGO! VENCEDOR ENCONTRADO! 🏆</h2>
            <p class="lead">Cartela Vencedora: <strong>${codigoVencedor}</strong></p>
            <p>Números Sorteados no Total: <strong>${bolasSorteadas.length}</strong></p>
            <p class="mt-3">Números da Cartela: <br> ${numerosVencedor}</p>
        </div>
    `;
}

// --- RENDERIZAÇÃO ADMIN (Controle) ---

function renderizarAdmin(estado) {
    const select = document.getElementById('select-bolas');
    if (select && select.value != estado.intervaloMax) {
        select.value = estado.intervaloMax;
    }
    
    document.getElementById('admin-status').innerHTML = `
        <p>Configuração Atual: **${estado.intervaloMax} Bolas** (1 - ${estado.intervaloMax})</p>
        <p>Bolas Restantes: **${estado.numerosASortear.length}**</p>
        <p>Vencedor Encontrado: ${estado.vencedorEncontrado ? '<span class="text-danger">SIM</span>' : '<span class="text-success">NÃO</span>'}</p>
        <p class="mt-2">ID do Usuário: <code class="bg-light text-dark p-1 rounded">${userId || 'Aguardando...'}</code></p>
    `;
    
    renderizarCartelasCadastradas(estado.cartelasCadastradas);
    atualizarPainelAnalise(estado.cartelasCadastradas, estado.bolasSorteadas, estado.intervaloMax);
}

function renderizarCartelasCadastradas(cartelas) {
    const cartelasDiv = document.getElementById('cartelas-cadastradas-lista');
    cartelasDiv.innerHTML = '';
    const cartelasArray = Object.entries(cartelas).sort(); 

    if (cartelasArray.length === 0) {
        cartelasDiv.innerHTML = '<p class="text-muted">Nenhuma cartela cadastrada.</p>';
        return;
    }

    cartelasArray.forEach(([codigo, numeros]) => {
        const div = document.createElement('div');
        div.className = 'card bg-light mb-2';
        div.innerHTML = `
            <div class="card-body p-2">
                <strong>Código: ${codigo}</strong> (${numeros.length} números)
                <br>
                <small>${numeros.map(n => String(n).padStart(2, '0')).sort((a, b) => a - b).join(' - ')}</small>
            </div>
        `;
        cartelasDiv.appendChild(div);
    });
}

function atualizarPainelAnalise(cartelas, bolasSorteadas, max) {
    const analiseDiv = document.getElementById('analise-cartelas');
    analiseDiv.innerHTML = '';

    if (Object.keys(cartelas).length === 0 || bolasSorteadas.length === 0) {
        analiseDiv.innerHTML = '<p class="text-muted">Cadastre cartelas e sorteie uma bola para iniciar a análise.</p>';
        return;
    }

    let progressoCartelas = [];

    for (const codigo in cartelas) {
        const numerosCartela = cartelas[codigo];
        const marcadas = numerosCartela.filter(n => bolasSorteadas.includes(n));
        const faltam = numerosCartela.length - marcadas.length;
        
        progressoCartelas.push({
            faltam: faltam,
            marcadas: marcadas.length,
            total: numerosCartela.length,
            codigo: codigo,
            numeros: numerosCartela,
            numerosMarcados: marcadas
        });
    }

    progressoCartelas.sort((a, b) => a.faltam - b.faltam);

    let htmlAnalise = '<h6>🥇 Cartelas Mais Próximas (Top 3)</h6>';
    const top3 = progressoCartelas.filter(p => p.faltam > 0).slice(0, 3);
    
    if (top3.length > 0) {
        top3.forEach(p => {
            htmlAnalise += `<p class="mb-1"><strong>${p.codigo}</strong>: Faltam **${p.faltam}** números (${p.marcadas}/${p.total})</p>`;
        });
    } else {
        htmlAnalise += '<p class="text-muted">Nenhuma cartela próxima ainda.</p>';
    }

    const faltamUm = progressoCartelas.filter(p => p.faltam === 1);
    htmlAnalise += '<h6 class="mt-3">🎯 Faltando Apenas 1 Número</h6>';
    if (faltamUm.length > 0) {
        faltamUm.forEach(p => {
            const faltaNum = p.numeros.find(n => !p.numerosMarcados.includes(n));
            htmlAnalise += `<p class="mb-1"><strong>${p.codigo}</strong>: Falta o número **${String(faltaNum).padStart(2, '0')}**</p>`;
        });
    } else {
        htmlAnalise += '<p class="text-muted">Nenhuma cartela com 1 faltando.</p>';
    }

    // Adiciona o progresso geral
    htmlAnalise += '<h6 class="mt-3">📋 Progresso Geral:</h6>';
    progressoCartelas.forEach(p => {
        const percentual = p.total > 0 ? (p.marcadas / p.total) * 100 : 0;
        const status = `Marcadas: ${p.marcadas}/${p.total} (${percentual.toFixed(0)}%) | Faltam: ${p.faltam}`;
        htmlAnalise += `<p class="mb-1"><code class="bg-light">${p.codigo}:</code> ${status}</p>`;
    });

    analiseDiv.innerHTML = htmlAnalise;
}


// --- EVENT LISTENERS GERAIS ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Inicializa o Firebase e a autenticação
    setupFirebase();

    // 2. Adiciona listeners após a inicialização (eles usarão estadoGlobal)
    if (document.body.id === 'index-page') {
        document.getElementById('btn-sortear').addEventListener('click', sortearBola);
        document.getElementById('btn-sortear-auto').addEventListener('click', toggleSorteioAutomatico);

    } else if (document.body.id === 'admin-page') {
        // Novo Listener para o botão Salvar Configuração
        document.getElementById('btn-salvar-config').addEventListener('click', mudarConfiguracao);
        
        document.getElementById('btn-cadastrar').addEventListener('click', cadastrarCartela);
        document.getElementById('btn-reset').addEventListener('click', () => resetarJogoCompleto(true));
        document.getElementById('btn-reset-full').addEventListener('click', () => resetarJogoCompleto(false));
    }
});