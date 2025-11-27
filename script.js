// --- Variáveis Globais de Configuração ---
const NOME_BINGO = "🎉 BINGÃO DA SORTE LOCAL 🍀";
const DEFAULT_MAX = 90;

// Chaves do LocalStorage
const GLOBAL_STATE_KEY = 'bingoGlobalState';
const CARTELAS_KEY = 'bingoCartelas';

// Variáveis de estado global (carregadas do LocalStorage)
let estadoGlobal = {
    intervaloMax: DEFAULT_MAX,
    numerosASortear: [],
    bolasSorteadas: [],
    vencedorEncontrado: false,
    vencedorCodigo: '',
    // cartelasCadastradas não está aqui, é salva separadamente
};

let cartelasCadastradas = {}; // Salvas e carregadas separadamente

// ----------------------------------------------------
// --- FUNÇÕES DE PERSISTÊNCIA (Local Storage) ---
// ----------------------------------------------------

function carregarEstado() {
    // Carrega o estado global
    const savedState = localStorage.getItem(GLOBAL_STATE_KEY);
    if (savedState) {
        estadoGlobal = JSON.parse(savedState);
    }

    // Carrega as cartelas
    const savedCartelas = localStorage.getItem(CARTELAS_KEY);
    if (savedCartelas) {
        cartelasCadastradas = JSON.parse(savedCartelas);
    }
    
    // Se o estado estiver vazio (primeira execução), inicializa
    if (estadoGlobal.numerosASortear.length === 0 && estadoGlobal.bolasSorteadas.length === 0) {
        estadoGlobal = criarNovoEstado(estadoGlobal.intervaloMax || DEFAULT_MAX, cartelasCadastradas);
        salvarEstado();
    }
}

function salvarEstado() {
    // Salva o estado global
    localStorage.setItem(GLOBAL_STATE_KEY, JSON.stringify(estadoGlobal));
    
    // Salva as cartelas
    localStorage.setItem(CARTELAS_KEY, JSON.stringify(cartelasCadastradas));
}

// ----------------------------------------------------
// --- FUNÇÕES DE LÓGICA DO JOGO ---
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
    };
}

function mudarConfiguracao() {
    const select = document.getElementById('select-bolas');
    const novoMax = parseInt(select.value);

    if (estadoGlobal.bolasSorteadas.length > 0 && 
        !confirm(`Mudar para ${novoMax} bolas irá reiniciar o jogo e apagar as bolas sorteadas. Deseja continuar?`)) {
        // Volta o seletor para o valor anterior, se cancelado
        select.value = estadoGlobal.intervaloMax;
        return;
    }
    
    estadoGlobal = criarNovoEstado(novoMax, cartelasCadastradas);
    salvarEstado();
    
    alert(`Configuração alterada para Bingo de ${novoMax} bolas. Jogo reiniciado.`);
    renderizarPaginaAtual(); // Renderiza com o novo estado
}

function sortearBola() {
    if (estadoGlobal.vencedorEncontrado) {
        document.getElementById('sorteio-status').innerHTML = '<p class="text-danger mt-3">🛑 O jogo já tem um vencedor.</p>';
        return;
    }

    if (estadoGlobal.numerosASortear.length === 0) {
        document.getElementById('sorteio-status').innerHTML = '<p class="text-danger mt-3">🛑 Todas as bolas foram sorteadas! Sem vencedor.</p>';
        estadoGlobal.vencedorEncontrado = true;
        salvarEstado();
        renderizarPaginaAtual();
        return;
    }
    
    // 1. Sorteio
    const bolaSorteada = estadoGlobal.numerosASortear.pop();
    estadoGlobal.bolasSorteadas.push(bolaSorteada);
    
    // Simula animação de destaque
    const bolaElement = document.getElementById('ultima-bola');
    if (bolaElement) {
        bolaElement.classList.add('bola-animada');
        setTimeout(() => { bolaElement.classList.remove('bola-animada'); }, 500);
    }

    // 2. Detecção de Vencedor
    let vencedor = null;
    for (const codigo in cartelasCadastradas) {
        const numerosCartela = cartelasCadastradas[codigo];
        // Verifica se TODOS os números da cartela estão nas bolas sorteadas
        const isVencedor = numerosCartela.every(n => estadoGlobal.bolasSorteadas.includes(n));
        
        if (isVencedor) {
            vencedor = codigo;
            break;
        }
    }

    if (vencedor) {
        estadoGlobal.vencedorEncontrado = true;
        estadoGlobal.vencedorCodigo = vencedor;
        clearInterval(intervaloAutomatico);
    }

    // 3. Salva o novo estado e renderiza
    salvarEstado();
    renderizarPaginaAtual();
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

function cadastrarCartela() {
    const codigoInput = document.getElementById('input-codigo').value.trim();
    const numerosInput = document.getElementById('input-numeros').value.trim();
    const mensagemDiv = document.getElementById('cadastro-mensagem');
    const max = estadoGlobal.intervaloMax;

    mensagemDiv.textContent = ''; 
    
    let codigo = codigoInput;
    if (!codigo) {
        codigo = `PC-${Math.floor(Math.random() * 9999) + 1}`; 
    }

    if (cartelasCadastradas[codigo] && 
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
        cartelasCadastradas[codigo] = numeros;
        salvarEstado(); 
        
        document.getElementById('input-codigo').value = '';
        document.getElementById('input-numeros').value = '';
        mensagemDiv.textContent = `Cartela '${codigo}' cadastrada/atualizada com sucesso!`;
        mensagemDiv.className = 'text-success mt-2';
        
        renderizarPaginaAtual();

    } catch (e) {
        console.error("Erro geral ao cadastrar cartela:", e);
        mensagemDiv.textContent = 'Erro inesperado. Verifique o console.';
        mensagemDiv.className = 'text-danger mt-2';
    }
}

function resetarJogoCompleto(manterCartelas = false) {
    if (!manterCartelas) {
        cartelasCadastradas = {};
    }
    
    estadoGlobal = criarNovoEstado(estadoGlobal.intervaloMax, cartelasCadastradas);
    
    salvarEstado();
    
    const msg = manterCartelas ? 'Jogo reiniciado! Cartelas mantidas.' : 'Reset Geral: Jogo e cartelas apagados.';
    alert(msg);
    renderizarPaginaAtual();
}

// ----------------------------------------------------
// --- FUNÇÕES DE RENDERIZAÇÃO (Compartilhadas) ---
// ----------------------------------------------------

function renderizarPaginaAtual() {
    // 1. Configura o cabeçalho em todas as páginas
    document.getElementById('bingo-title').textContent = NOME_BINGO;
    document.getElementById('footer-text').textContent = "By: An.Yoshi 2025";
    document.getElementById('world-random-number').textContent = Math.floor(Math.random() * 9999999) + 1;

    // 2. Chama a função de renderização específica
    if (document.body.id === 'index-page') {
        renderizarIndex(estadoGlobal, cartelasCadastradas);
    } else if (document.body.id === 'admin-page') {
        renderizarAdmin(estadoGlobal, cartelasCadastradas);
    }
}

// --- RENDERIZAÇÃO INDEX (Sorteio) ---

function renderizarIndex(estado, cartelas) {
    const ultimaBola = estado.bolasSorteadas.length > 0 ? estado.bolasSorteadas.slice(-1)[0] : '—';
    document.getElementById('ultima-bola').textContent = String(ultimaBola).padStart(2, '0');
    
    renderizarBolasSorteadas(estado.bolasSorteadas);
    
    const statusDiv = document.getElementById('sorteio-status');
    statusDiv.innerHTML = '';
    
    if (estado.vencedorEncontrado) {
        if (estado.vencedorCodigo) {
             exibirVencedor(estado.vencedorCodigo, cartelas, estado.bolasSorteadas);
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

function renderizarAdmin(estado, cartelas) {
    const select = document.getElementById('select-bolas');
    if (select && select.value != estado.intervaloMax) {
        select.value = estado.intervaloMax;
    }
    
    document.getElementById('admin-status').innerHTML = `
        <p>Configuração Atual: **${estado.intervaloMax} Bolas** (1 - ${estado.intervaloMax})</p>
        <p>Bolas Restantes: **${estado.numerosASortear.length}**</p>
        <p>Vencedor Encontrado: ${estado.vencedorEncontrado ? '<span class="text-danger">SIM</span>' : '<span class="text-success">NÃO</span>'}</p>
    `;
    
    renderizarCartelasCadastradas(cartelas);
    atualizarPainelAnalise(cartelas, estado.bolasSorteadas, estado.intervaloMax);
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
    // 1. Carrega o estado e as cartelas
    carregarEstado();

    // 2. Adiciona listeners 
    if (document.body.id === 'index-page') {
        document.getElementById('btn-sortear').addEventListener('click', sortearBola);
        document.getElementById('btn-sortear-auto').addEventListener('click', toggleSorteioAutomatico);

    } else if (document.body.id === 'admin-page') {
        // Listener para o botão Salvar Configuração (que chama mudarConfiguracao)
        document.getElementById('btn-salvar-config').addEventListener('click', mudarConfiguracao);
        
        document.getElementById('btn-cadastrar').addEventListener('click', cadastrarCartela);
        document.getElementById('btn-reset').addEventListener('click', () => resetarJogoCompleto(true));
        document.getElementById('btn-reset-full').addEventListener('click', () => resetarJogoCompleto(false));
    }

    // Renderiza a interface inicial (após carregar o estado)
    renderizarPaginaAtual();
});
