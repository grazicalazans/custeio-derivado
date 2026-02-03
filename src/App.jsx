import React, { useState, useEffect } from 'react';
import { Upload, LogOut, Filter, Search, AlertCircle, FileDown, UserCheck, UserX, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { auth, db } from './firebase';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot
} from 'firebase/firestore';

const App = () => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  
  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  
  // Cadastro
  const [registerData, setRegisterData] = useState({
    nome: '',
    cpf: '',
    endereco: '',
    cidade: '',
    estado: '',
    cep: '',
    telefone: '',
    email: '',
    password: ''
  });
  const [registerError, setRegisterError] = useState('');
  
  // Dados
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUF, setFilterUF] = useState('');
  const [filterProduto, setFilterProduto] = useState('');
  const [filterLocal, setFilterLocal] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [lastUpdate, setLastUpdate] = useState(null);
  
  // Admin
  const [pendingUsers, setPendingUsers] = useState([]);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [updateHistory, setUpdateHistory] = useState([]);

  // Verificar autenticação
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Buscar dados do usuário
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          
          // Se for admin, buscar solicitações pendentes
          if (data.role === 'admin') {
            loadPendingUsers();
            loadUpdateHistory();
          }
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Carregar dados da planilha em tempo real
  useEffect(() => {
    if (!user) return;

    const unsubscribe = onSnapshot(doc(db, 'custeio', 'dados'), (docSnap) => {
      if (docSnap.exists()) {
        const docData = docSnap.data();
        setData(docData.registros || []);
        setLastUpdate(docData.lastUpdate);
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Filtrar dados
  useEffect(() => {
    let result = [...data];

    if (searchTerm) {
      result = result.filter(item =>
        (item.LOCAL && item.LOCAL.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.UF_Destino && item.UF_Destino.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.Produto && item.Produto.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    if (filterUF) result = result.filter(item => item.UF_Destino === filterUF);
    if (filterProduto) result = result.filter(item => item.Produto === filterProduto);
    if (filterLocal) result = result.filter(item => item.LOCAL === filterLocal);

    setFilteredData(result);
  }, [data, searchTerm, filterUF, filterProduto, filterLocal]);

  const loadPendingUsers = async () => {
    const snapshot = await getDocs(collection(db, 'solicitacoes'));
    const pending = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setPendingUsers(pending);
  };

  const loadUpdateHistory = async () => {
    const q = query(collection(db, 'historico'), orderBy('timestamp', 'desc'), limit(10));
    const snapshot = await getDocs(q);
    const history = snapshot.docs.map(doc => doc.data());
    setUpdateHistory(history);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setLoginError('Email ou senha incorretos');
      } else if (error.code === 'auth/too-many-requests') {
        setLoginError('Muitas tentativas. Tente novamente mais tarde.');
      } else {
        setLoginError('Erro ao fazer login. Tente novamente.');
      }
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegisterError('');

    if (registerData.password.length < 6) {
      setRegisterError('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    try {
      // Criar solicitação de cadastro
      await setDoc(doc(collection(db, 'solicitacoes')), {
        ...registerData,
        createdAt: new Date().toISOString(),
        status: 'pending'
      });

      alert('Solicitação enviada! Aguarde a aprovação do administrador.');
      setShowRegister(false);
      setRegisterData({
        nome: '',
        cpf: '',
        endereco: '',
        cidade: '',
        estado: '',
        cep: '',
        telefone: '',
        email: '',
        password: ''
      });
    } catch (error) {
      setRegisterError('Erro ao enviar solicitação. Tente novamente.');
    }
  };

  const approveUser = async (request) => {
    try {
      // Criar usuário no Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        request.email,
        request.password
      );

      // Salvar dados do usuário no Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        nome: request.nome,
        cpf: request.cpf,
        endereco: request.endereco,
        cidade: request.cidade,
        estado: request.estado,
        cep: request.cep,
        telefone: request.telefone,
        email: request.email,
        role: 'user',
        createdAt: new Date().toISOString()
      });

      // Remover solicitação
      await deleteDoc(doc(db, 'solicitacoes', request.id));

      alert('Usuário aprovado com sucesso!');
      loadPendingUsers();
    } catch (error) {
      alert('Erro ao aprovar usuário: ' + error.message);
    }
  };

  const rejectUser = async (requestId) => {
    if (confirm('Tem certeza que deseja rejeitar este cadastro?')) {
      await deleteDoc(doc(db, 'solicitacoes', requestId));
      alert('Solicitação rejeitada');
      loadPendingUsers();
    }
  };

  const handleFileUpload = async (e) => {
    console.log('1. Iniciando upload...');
    
    if (userData?.role !== 'admin') {
      console.log('2. Usuário não é admin');
      setUploadMessage('Apenas administradores podem carregar planilhas');
      setTimeout(() => setUploadMessage(''), 3000);
      return;
    }

    const file = e.target.files[0];
    if (!file) {
      console.log('3. Nenhum arquivo selecionado');
      return;
    }

    console.log('4. Arquivo selecionado:', file.name);
    setUploadMessage('Processando planilha...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        console.log('5. Lendo arquivo...');
        const workbook = XLSX.read(event.target.result, { type: 'binary' });
        console.log('6. Workbook lido. Abas:', workbook.SheetNames);
        
        const sheetName = 'Custeio Derivado';

        if (!workbook.SheetNames.includes(sheetName)) {
          console.log('7. Aba não encontrada');
          setUploadMessage(`Erro: A planilha não contém a aba "${sheetName}". Abas: ${workbook.SheetNames.join(', ')}`);
          setTimeout(() => setUploadMessage(''), 8000);
          return;
        }

        console.log('8. Aba encontrada, convertendo para JSON...');
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        console.log('9. JSON convertido. Total de linhas:', jsonData.length);

        const formattedData = jsonData.map(row => ({
          LOCAL: row.LOCAL || '',
          MODALIDADE_VENDA: row['MODALIDADE VENDA'] || '',
          UF_Destino: row['UF Destino'] || '',
          Produto: row.Produto || '',
          Custeio_Derivado: parseFloat(row['Custeio Derivado']) || 0,
          Custeio_Biocomb: parseFloat(row['Custeio Biocomb']) || 0,
          FOB_Zero: parseFloat(row['FOB Zero']) || 0
        })).filter(item => item.LOCAL && item.Produto);

        console.log('10. Dados formatados:', formattedData.length, 'registros válidos');

        if (formattedData.length === 0) {
          console.log('11. Nenhum dado válido');
          setUploadMessage('Erro: Não foram encontrados dados válidos');
          setTimeout(() => setUploadMessage(''), 5000);
          return;
        }

        // Salvar no Firestore
        console.log('12. Salvando no Firestore...');
        const updateDate = new Date().toLocaleString('pt-BR');
        
        await setDoc(doc(db, 'custeio', 'dados'), {
          registros: formattedData,
          lastUpdate: updateDate,
          updatedBy: userData.nome
        });
        
        console.log('13. Dados salvos no Firestore!');

        // Salvar no histórico
        console.log('14. Salvando histórico...');
        await setDoc(doc(collection(db, 'historico')), {
          timestamp: new Date().toISOString(),
          date: updateDate,
          user: userData.nome,
          recordCount: formattedData.length
        });
        
        console.log('15. Histórico salvo!');

        setUploadMessage(`✓ ${formattedData.length} registros atualizados!`);
        setTimeout(() => setUploadMessage(''), 5000);

        if (userData.role === 'admin') {
          loadUpdateHistory();
        }
        
        console.log('16. Upload completo!');
      } catch (error) {
        console.error('ERRO:', error);
        setUploadMessage('Erro ao processar planilha: ' + error.message);
        setTimeout(() => setUploadMessage(''), 5000);
      }
    };

    reader.onerror = (error) => {
      console.error('Erro ao ler arquivo:', error);
      setUploadMessage('Erro ao ler arquivo');
      setTimeout(() => setUploadMessage(''), 5000);
    };

    console.log('17. Iniciando leitura do arquivo...');
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 14;
    let yPosition = 20;

    // Título
    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text('Relatório de Custeio Derivado', margin, yPosition);
    yPosition += 10;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 8;

    // Dados do Usuário
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'bold');
    doc.text('Dados do Usuário', margin, yPosition);
    yPosition += 6;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Nome: ${userData?.nome || 'N/A'}`, margin, yPosition);
    yPosition += 5;
    doc.text(`CPF: ${userData?.cpf || 'N/A'}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Email: ${userData?.email || 'N/A'}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Telefone: ${userData?.telefone || 'N/A'}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Endereço: ${userData?.endereco || 'N/A'}, ${userData?.cidade || ''} - ${userData?.estado || ''}`, margin, yPosition);
    yPosition += 5;
    doc.text(`CEP: ${userData?.cep || 'N/A'}`, margin, yPosition);
    yPosition += 5;

    doc.setTextColor(100, 100, 100);
    doc.setFontSize(9);
    doc.text(`Data de exportação: ${new Date().toLocaleString('pt-BR')}`, margin, yPosition);
    yPosition += 8;

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 6;

    // Tabela
    doc.setTextColor(0, 0, 0);
    const tableData = filteredData.map(item => [
      item.LOCAL,
      item.UF_Destino,
      item.Produto,
      item.MODALIDADE_VENDA,
      item.Custeio_Derivado.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.Custeio_Biocomb.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      item.FOB_Zero.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    ]);

    doc.autoTable({
      startY: yPosition,
      head: [['Local', 'UF', 'Produto', 'Modal.', 'Custeio Der.', 'Custeio Bio.', 'FOB Zero']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 12, halign: 'center' },
        2: { cellWidth: 35 },
        3: { cellWidth: 18, fontSize: 6 },
        4: { cellWidth: 24, halign: 'right' },
        5: { cellWidth: 24, halign: 'right' },
        6: { cellWidth: 24, halign: 'right' }
      },
      margin: { left: margin, right: margin }
    });

    const finalY = doc.lastAutoTable.finalY || yPosition;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Total de registros: ${filteredData.length}`, margin, finalY + 8);

    const fileName = `custeio_derivado_${userData?.nome?.replace(/\s+/g, '_') || 'usuario'}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const locais = [...new Set(data.map(item => item.LOCAL))].sort();
  const ufs = [...new Set(data.map(item => item.UF_Destino))].sort();
  const produtos = [...new Set(data.map(item => item.Produto))].sort();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  // Tela de Login/Cadastro
  if (!user || !userData) {
    if (showRegister) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-2xl">
            <div className="text-center mb-6">
              <h2 className="text-3xl font-bold text-gray-800">Solicitar Cadastro</h2>
              <p className="text-gray-600 mt-2">Preencha seus dados para solicitar acesso</p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo *</label>
                  <input
                    type="text"
                    value={registerData.nome}
                    onChange={(e) => setRegisterData({...registerData, nome: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                  <input
                    type="text"
                    value={registerData.cpf}
                    onChange={(e) => setRegisterData({...registerData, cpf: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="000.000.000-00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={registerData.email}
                    onChange={(e) => setRegisterData({...registerData, email: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone *</label>
                  <input
                    type="tel"
                    value={registerData.telefone}
                    onChange={(e) => setRegisterData({...registerData, telefone: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Endereço *</label>
                  <input
                    type="text"
                    value={registerData.endereco}
                    onChange={(e) => setRegisterData({...registerData, endereco: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                  <input
                    type="text"
                    value={registerData.cidade}
                    onChange={(e) => setRegisterData({...registerData, cidade: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
                  <select
                    value={registerData.estado}
                    onChange={(e) => setRegisterData({...registerData, estado: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecione</option>
                    {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                  <input
                    type="text"
                    value={registerData.cep}
                    onChange={(e) => setRegisterData({...registerData, cep: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="00000-000"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Senha * (mín. 6 caracteres)</label>
                  <input
                    type="password"
                    value={registerData.password}
                    onChange={(e) => setRegisterData({...registerData, password: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              {registerError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">{registerError}</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowRegister(false)}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-400 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
                >
                  Solicitar Cadastro
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-800">Custeio Derivado</h2>
            <p className="text-gray-600 mt-2">Sistema de Precificação Centralizado</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="seu@email.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Digite sua senha"
                required
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                <span className="text-sm">{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Entrar
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-gray-600 text-sm mb-3">Não tem acesso?</p>
            <button
              onClick={() => setShowRegister(true)}
              className="text-blue-600 hover:text-blue-800 font-semibold"
            >
              Solicitar cadastro
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Principal
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold">Custeio Derivado - Precificação</h1>
              <p className="text-blue-100 text-sm">
                {lastUpdate ? `Última atualização: ${lastUpdate}` : 'Aguardando primeira atualização'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {userData?.role === 'admin' && (
                <button
                  onClick={() => setShowAdminPanel(!showAdminPanel)}
                  className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 px-4 py-2 rounded-lg transition-colors text-sm"
                >
                  <UserCheck className="w-4 h-4" />
                  Painel Admin
                  {pendingUsers.length > 0 && (
                    <span className="bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">
                      {pendingUsers.length}
                    </span>
                  )}
                </button>
              )}
              <div className="text-right">
                <div className="text-sm text-blue-100">
                  <strong>{userData?.nome}</strong>
                  {userData?.role === 'admin' && <span className="ml-2 bg-yellow-400 text-gray-800 px-2 py-1 rounded text-xs">ADMIN</span>}
                </div>
                <div className="text-xs text-blue-200">{userData?.email}</div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Painel Admin */}
        {userData?.role === 'admin' && showAdminPanel && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Painel de Administração</h3>
            
            {/* Solicitações Pendentes */}
            <div className="mb-6">
              <h4 className="font-medium text-gray-700 mb-3">Solicitações de Cadastro ({pendingUsers.length})</h4>
              {pendingUsers.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma solicitação pendente</p>
              ) : (
                <div className="space-y-3">
                  {pendingUsers.map(request => (
                    <div key={request.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{request.nome}</p>
                          <p className="text-sm text-gray-600">{request.email}</p>
                          <p className="text-sm text-gray-600">CPF: {request.cpf}</p>
                          <p className="text-sm text-gray-600">{request.cidade} - {request.estado}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveUser(request)}
                            className="flex items-center gap-1 bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm"
                          >
                            <UserCheck className="w-4 h-4" />
                            Aprovar
                          </button>
                          <button
                            onClick={() => rejectUser(request.id)}
                            className="flex items-center gap-1 bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                          >
                            <UserX className="w-4 h-4" />
                            Rejeitar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Histórico de Atualizações */}
            <div>
              <h4 className="font-medium text-gray-700 mb-3">Histórico de Atualizações</h4>
              {updateHistory.length === 0 ? (
                <p className="text-gray-500 text-sm">Nenhuma atualização registrada</p>
              ) : (
                <div className="space-y-2">
                  {updateHistory.map((update, index) => (
                    <div key={index} className="flex items-center gap-3 text-sm text-gray-600 border-b border-gray-100 pb-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span>{update.date}</span>
                      <span className="font-medium">{update.user}</span>
                      <span className="text-gray-500">({update.recordCount} registros)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {userData?.role === 'admin' ? 'Atualizar Dados da Planilha' : 'Consultar Dados'}
              </h3>
              <p className="text-gray-600 text-sm">
                {userData?.role === 'admin' 
                  ? 'Carregue a planilha Excel com a aba "Custeio Derivado". Todos os usuários verão os dados atualizados.'
                  : 'Visualize os dados centralizados e exporte relatórios personalizados.'
                }
              </p>
            </div>

            <div className="flex gap-3">
              {data.length > 0 && (
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                >
                  <FileDown className="w-5 h-5" />
                  Exportar PDF
                </button>
              )}

              {userData?.role === 'admin' && (
                <label className="cursor-pointer flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  <Upload className="w-5 h-5" />
                  Carregar Planilha
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>

          {uploadMessage && (
            <div className={`mt-4 px-4 py-3 rounded-lg ${uploadMessage.includes('✓') ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200'}`}>
              {uploadMessage}
            </div>
          )}
        </div>

        {data.length > 0 && (
          <>
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Search className="w-4 h-4 inline mr-1" />
                    Buscar
                  </label>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Local, UF ou Produto..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Filter className="w-4 h-4 inline mr-1" />
                    Local
                  </label>
                  <select
                    value={filterLocal}
                    onChange={(e) => setFilterLocal(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    {locais.map(local => (
                      <option key={local} value={local}>{local}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Filter className="w-4 h-4 inline mr-1" />
                    UF Destino
                  </label>
                  <select
                    value={filterUF}
                    onChange={(e) => setFilterUF(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    {ufs.map(uf => (
                      <option key={uf} value={uf}>{uf}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Filter className="w-4 h-4 inline mr-1" />
                    Produto
                  </label>
                  <select
                    value={filterProduto}
                    onChange={(e) => setFilterProduto(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Todos</option>
                    {produtos.map(prod => (
                      <option key={prod} value={prod}>{prod}</option>
                    ))}
                  </select>
                </div>
              </div>

              {(searchTerm || filterUF || filterProduto || filterLocal) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterUF('');
                    setFilterProduto('');
                    setFilterLocal('');
                  }}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                >
                  Limpar filtros
                </button>
              )}
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Total de Registros</div>
                <div className="text-3xl font-bold text-blue-600">{filteredData.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Locais</div>
                <div className="text-3xl font-bold text-green-600">
                  {[...new Set(filteredData.map(item => item.LOCAL))].length}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">UFs</div>
                <div className="text-3xl font-bold text-purple-600">
                  {[...new Set(filteredData.map(item => item.UF_Destino))].length}
                </div>
              </div>
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="text-sm text-gray-600 mb-1">Produtos</div>
                <div className="text-3xl font-bold text-orange-600">
                  {[...new Set(filteredData.map(item => item.Produto))].length}
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800">
                  Dados de Custeio ({filteredData.length} registros)
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Local</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">UF</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Produto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Modalidade</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Custeio Deriv.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">Custeio Biocomb.</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 uppercase">FOB Zero</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredData.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                          Nenhum registro encontrado
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-800 font-medium">{item.LOCAL}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {item.UF_Destino}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700">{item.Produto}</td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{item.MODALIDADE_VENDA}</td>
                          <td className="px-4 py-3 text-right font-semibold text-green-600">
                            {item.Custeio_Derivado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-purple-600">
                            {item.Custeio_Biocomb.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-blue-600">
                            {item.FOB_Zero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {data.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              {userData?.role === 'admin' ? 'Nenhuma planilha carregada' : 'Aguardando dados'}
            </h3>
            <p className="text-gray-600">
              {userData?.role === 'admin' 
                ? 'Faça upload da planilha de precificação para começar'
                : 'O administrador ainda não carregou os dados'
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
